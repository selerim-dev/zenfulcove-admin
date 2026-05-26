import { NextResponse } from "next/server";
import { validateTwilioSignature, normalizePhone } from "@/lib/twilio";
import { appendSmsMessage, getConfig } from "@/lib/kv";
import { sendPlainEmail } from "@/lib/sendgrid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function twimlEmpty() {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } }
  );
}

function buildPublicUrl(request) {
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const url = new URL(request.url);
  return `${forwardedProto}://${host}${url.pathname}${url.search}`;
}

export async function POST(request) {
  const formData = await request.formData();
  const params = {};
  for (const [key, value] of formData.entries()) {
    params[key] = String(value);
  }

  const signature = request.headers.get("x-twilio-signature") || "";
  const publicUrl = buildPublicUrl(request);

  const skipValidation = process.env.TWILIO_SKIP_SIGNATURE_CHECK === "true";
  if (!skipValidation) {
    const valid = validateTwilioSignature({ url: publicUrl, params, signature });
    if (!valid) {
      return new NextResponse("Invalid Twilio signature", { status: 403 });
    }
  }

  const twilioNumber = normalizePhone(params.To);
  const contactPhone = normalizePhone(params.From);
  const body = params.Body || "";
  const sid = params.MessageSid || params.SmsMessageSid || "";

  if (!twilioNumber || !contactPhone) {
    return twimlEmpty();
  }

  await appendSmsMessage({
    twilioNumber,
    contactPhone,
    message: {
      id: sid || `in_${Date.now()}`,
      direction: "in",
      body,
      twilioNumber,
      contactPhone,
      timestamp: Date.now(),
      sid,
      status: "received",
    },
  });

  try {
    await notifyInboundMessage({ twilioNumber, contactPhone, body });
  } catch (err) {
    console.error("Inbound SMS notification failed:", err);
  }

  return twimlEmpty();
}

async function notifyInboundMessage({ twilioNumber, contactPhone, body }) {
  const config = await getConfig();
  const notif = config?.messageNotifications;
  if (!notif?.enabled) return;

  const recipients = Array.isArray(notif.recipients)
    ? notif.recipients.map((r) => String(r || "").trim()).filter(Boolean)
    : [];
  if (recipients.length === 0) return;

  const from = {
    email: config?.sendgrid?.fromEmail,
    name: config?.sendgrid?.fromName,
  };
  if (!from.email) return;

  const prefix = String(notif.subjectPrefix || "[Zenfulcove Glamping SMS]").trim();
  const preview = String(body || "").slice(0, 120).replace(/\s+/g, " ").trim();
  const subject = `${prefix} New message from ${contactPhone}${preview ? ` — ${preview}` : ""}`;

  const deepLink = buildDashboardDeepLink({
    base: notif.dashboardUrl,
    twilioNumber,
    contactPhone,
  });

  const lines = [
    `You received a new SMS at ${twilioNumber} from ${contactPhone}.`,
    "",
    "Message:",
    body || "(empty message)",
    "",
    `Received: ${new Date().toISOString()}`,
    "",
  ];
  if (deepLink) {
    lines.push(`Open this conversation: ${deepLink}`);
  } else {
    lines.push("Open the Zenfulcove Glamping admin dashboard to reply or manage this conversation.");
  }
  const text = lines.join("\n");

  await Promise.all(
    recipients.map((to) => sendPlainEmail({ to, subject, text, from }))
  );
}

function buildDashboardDeepLink({ base, twilioNumber, contactPhone }) {
  const rawBase =
    String(base || "").trim() || "https://zenfulcove-admin.vercel.app/";
  if (!rawBase) return "";
  try {
    const url = new URL(rawBase);
    url.searchParams.set("tab", "messages");
    if (twilioNumber) url.searchParams.set("number", twilioNumber);
    if (contactPhone) url.searchParams.set("contact", contactPhone);
    return url.toString();
  } catch {
    return "";
  }
}
