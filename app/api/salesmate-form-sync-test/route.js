import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { getConfig } from "@/lib/kv";
import { runSalesmateFormSync } from "@/app/api/cron/route";

export async function POST(request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;
    const salesmateFormSync = body?.salesmateFormSync || null;

    const automationConfig = await getConfig();
    automationConfig.salesmateFormSync = {
      ...(automationConfig.salesmateFormSync || {}),
      ...(salesmateFormSync || {}),
      // Force-enable for the duration of this test request so the user can
      // dry-run / live-run from the UI even when the master toggle is off.
      enabled: true,
    };

    const logs = await runSalesmateFormSync(automationConfig, dryRun);
    const hasFailed = logs.some((log) => log.status === "failed");

    return NextResponse.json({
      status: hasFailed ? "FAILED" : "SUCCESS",
      timestamp: new Date().toISOString(),
      logs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Salesmate form sync test failed." },
      { status: 500 }
    );
  }
}
