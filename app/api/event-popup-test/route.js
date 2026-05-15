import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { getConfig } from "@/lib/kv";
import { runEventPopupSalesmateSms } from "@/app/api/cron/route";

export async function POST(request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const dryRun = body?.dryRun === true;
    const destination = String(body?.destination || "").trim();
    const eventPopupSalesmateSms = body?.eventPopupSalesmateSms || null;

    if (!dryRun && !destination) {
      return NextResponse.json(
        { error: "A test phone number is required for live test sends." },
        { status: 400 }
      );
    }

    const automationConfig = await getConfig();
    if (eventPopupSalesmateSms) {
      automationConfig.eventPopupSalesmateSms = eventPopupSalesmateSms;
    }

    const logs = await runEventPopupSalesmateSms(automationConfig, dryRun, {
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
      { error: err.message || "Event popup test failed." },
      { status: 500 }
    );
  }
}
