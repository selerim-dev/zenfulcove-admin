import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { getConfig } from "@/lib/kv";
import { runPopupFollowups } from "@/app/api/cron/route";

export async function POST(request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const channel = String(body?.channel || "email").trim().toLowerCase();
    const dryRun = body?.dryRun === true;
    const destination = String(body?.destination || "").trim();
    const popupFollowups = body?.popupFollowups || null;
    const sendgrid = body?.sendgrid || null;

    if (!["email", "sms"].includes(channel)) {
      return NextResponse.json({ error: "Invalid test channel." }, { status: 400 });
    }

    if (!dryRun && !destination) {
      return NextResponse.json(
        { error: "A test destination is required for live test sends." },
        { status: 400 }
      );
    }

    const automationConfig = await getConfig();
    if (popupFollowups) automationConfig.popupFollowups = popupFollowups;
    if (sendgrid) automationConfig.sendgrid = sendgrid;

    const logs = await runPopupFollowups(automationConfig, dryRun, channel, {
      testDestination: destination,
      persistState: false,
      maxSends: 1,
    });

    const hasFailed = logs.some((log) => log.status === "failed");
    return NextResponse.json({
      status: hasFailed ? "FAILED" : "SUCCESS",
      timestamp: new Date().toISOString(),
      logs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Popup test failed." },
      { status: 500 }
    );
  }
}
