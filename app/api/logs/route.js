import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const LOGS_PATH = path.join(process.cwd(), "logs", "activity.json");
const LAST_RUN_PATH = path.join(process.cwd(), "logs", "last-run.json");
const DEFAULT_LIMIT = 10;

export async function GET(request) {
  try {
    const raw = await fs.readFile(LOGS_PATH, "utf-8");
    const allLogs = JSON.parse(raw);
    const total = allLogs.length;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10)));

    const reversed = [...allLogs].reverse();
    const start = (page - 1) * limit;
    const logs = reversed.slice(start, start + limit);
    const totalPages = Math.ceil(total / limit);

    let latestRun = null;
    if (page === 1) {
      try {
        const lastRunRaw = await fs.readFile(LAST_RUN_PATH, "utf-8");
        latestRun = JSON.parse(lastRunRaw);
      } catch {
        // Use most recent log as fallback
        if (logs.length > 0) {
          latestRun = {
            timestamp: logs[0].timestamp,
            status: allLogs.some((l) => l.status === "failed") ? "FAILED" : "SUCCESS",
          };
        }
      }
    }

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
      totalPages,
      ...(latestRun && { latestRun }),
    });
  } catch {
    return NextResponse.json({ logs: [], total: 0, page: 1, limit: DEFAULT_LIMIT, totalPages: 0 });
  }
}
