import { NextResponse } from "next/server";
import { clearAllSmsData } from "@/lib/kv";
import { normalizePhone } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const twilioNumber = body?.twilioNumber ? normalizePhone(body.twilioNumber) : "";
    const result = await clearAllSmsData(twilioNumber || null);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Clear failed." },
      { status: 500 }
    );
  }
}
