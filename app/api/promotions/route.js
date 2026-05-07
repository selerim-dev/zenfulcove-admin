import { NextResponse } from "next/server";
import { getConfig } from "@/lib/kv";
import { appendLogs, writeLastRunStatus } from "@/lib/activity-log";
import { runOneOffPromotion } from "@/lib/promotions";

export async function POST(request) {
  try {
    const body = await request.json();
    const config = await getConfig();

    const logs = await runOneOffPromotion({
      config,
      mode: body?.mode,
      segments: body?.segments,
      lists: body?.lists,
      channel: body?.channel,
      templateId: body?.templateId,
      smsBody: body?.smsBody,
      testDestinations: body?.testDestinations,
    });

    const icon = (status) =>
      status === "success" ? "✓" : status === "failed" ? "✗" : status === "info" ? "→" : "○";
    logs.forEach((log) => {
      console.log(`[promotions] ${icon(log.status)} ${log.action}`);
    });

    await appendLogs(logs);

    const hasFailed = logs.some((log) => log.status === "failed");
    await writeLastRunStatus(hasFailed ? "FAILED" : "SUCCESS");

    return NextResponse.json({
      status: hasFailed ? "FAILED" : "SUCCESS",
      timestamp: new Date().toISOString(),
      logs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Promotion send failed." },
      { status: 500 }
    );
  }
}
