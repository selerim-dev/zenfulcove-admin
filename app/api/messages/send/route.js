import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { sendSms, normalizePhone, getConfiguredTwilioNumbers } from "@/lib/twilio";
import { appendSmsMessage } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const twilioNumber = normalizePhone(body?.twilioNumber);
    const contactPhone = normalizePhone(body?.contactPhone);
    const messageBody = String(body?.body || "").trim();

    if (!twilioNumber || !contactPhone || !messageBody) {
      return NextResponse.json(
        { error: "twilioNumber, contactPhone, and body are required." },
        { status: 400 }
      );
    }

    const number = getConfiguredTwilioNumbers().find(
      (n) => normalizePhone(n.number) === twilioNumber
    );
    if (!number || !number.enabled) {
      return NextResponse.json(
        { error: "This Twilio number is not enabled for sending." },
        { status: 400 }
      );
    }

    const result = await sendSms({ to: contactPhone, body: messageBody, from: twilioNumber });

    await appendSmsMessage({
      twilioNumber,
      contactPhone,
      message: {
        id: result?.sid || `out_${Date.now()}`,
        direction: "out",
        body: messageBody,
        twilioNumber,
        contactPhone,
        timestamp: Date.now(),
        sid: result?.sid || "",
        status: result?.status || "sent",
      },
    });

    return NextResponse.json({ success: true, sid: result?.sid || null });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Failed to send SMS." },
      { status: 500 }
    );
  }
}
