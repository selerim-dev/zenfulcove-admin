import { NextResponse } from "next/server";
import { validateTwilioSignature, normalizePhone } from "@/lib/twilio";
import { appendSmsMessage } from "@/lib/kv";

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

  return twimlEmpty();
}
