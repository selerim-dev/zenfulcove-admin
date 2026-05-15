import fs from "fs/promises";
import path from "path";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";

const LOGS_PATH = path.join(process.cwd(), "logs", "activity.json");
const LAST_RUN_PATH = path.join(process.cwd(), "logs", "last-run.json");
const SERVERLESS_RUNTIME =
  process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

function normalizeStatus(status) {
  return String(status || "info").trim() || "info";
}

function normalizeLogEntry(entry) {
  const log = entry && typeof entry === "object" ? entry : {};
  return {
    timestamp: log.timestamp || new Date().toISOString(),
    automation: String(log.automation || ""),
    property: String(log.property || ""),
    action: String(log.action || ""),
    status: normalizeStatus(log.status),
    payload: log,
  };
}

async function appendLogsToSupabase(entries) {
  if (!hasSupabaseAdminEnv()) return false;

  const rows = entries.map((entry) => normalizeLogEntry(entry));
  if (rows.length === 0) return true;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("automation_logs").insert(rows);
  if (error) throw error;
  return true;
}

async function writeLastRunToSupabase(status) {
  if (!hasSupabaseAdminEnv()) return false;

  const now = new Date().toISOString();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("automation_runs").insert({
    source: "admin",
    status,
    started_at: now,
    finished_at: now,
  });
  if (error) throw error;
  return true;
}

async function readLogsFromSupabase({ page = 1, limit = 10 } = {}) {
  if (!hasSupabaseAdminEnv()) return null;

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const start = (safePage - 1) * safeLimit;
  const end = start + safeLimit - 1;

  const supabase = createSupabaseAdminClient();
  const { data, count, error } = await supabase
    .from("automation_logs")
    .select("timestamp, automation, property, action, status, payload", {
      count: "exact",
    })
    .order("timestamp", { ascending: false })
    .range(start, end);

  if (error) throw error;

  const logs = (data || []).map((row) => ({
    ...(row.payload && typeof row.payload === "object" ? row.payload : {}),
    timestamp: row.timestamp,
    automation: row.automation,
    property: row.property,
    action: row.action,
    status: row.status,
  }));

  const total = count || 0;
  const totalPages = Math.ceil(total / safeLimit);
  let latestRun = null;

  if (safePage === 1) {
    const { data: run } = await supabase
      .from("automation_runs")
      .select("finished_at, started_at, status")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (run) {
      latestRun = {
        timestamp: run.finished_at || run.started_at,
        status: run.status,
      };
    } else if (logs.length > 0) {
      latestRun = {
        timestamp: logs[0].timestamp,
        status: logs.some((log) => log.status === "failed")
          ? "FAILED"
          : "SUCCESS",
      };
    }
  }

  return {
    logs,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
    latestRun,
  };
}

async function readLogsFromFile({ page = 1, limit = 10 } = {}) {
  const raw = await fs.readFile(LOGS_PATH, "utf-8");
  const allLogs = JSON.parse(raw);
  const total = allLogs.length;
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const reversed = [...allLogs].reverse();
  const start = (safePage - 1) * safeLimit;
  const logs = reversed.slice(start, start + safeLimit);
  const totalPages = Math.ceil(total / safeLimit);

  let latestRun = null;
  if (safePage === 1) {
    try {
      const lastRunRaw = await fs.readFile(LAST_RUN_PATH, "utf-8");
      latestRun = JSON.parse(lastRunRaw);
    } catch {
      if (logs.length > 0) {
        latestRun = {
          timestamp: logs[0].timestamp,
          status: allLogs.some((log) => log.status === "failed")
            ? "FAILED"
            : "SUCCESS",
        };
      }
    }
  }

  return {
    logs,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
    latestRun,
  };
}

export async function appendLogs(newEntries) {
  const entries = Array.isArray(newEntries) ? newEntries : [];
  if (entries.length === 0) return;

  try {
    if (await appendLogsToSupabase(entries)) return;
  } catch (err) {
    console.warn("[activity-log] Supabase append failed:", err.message);
  }

  if (SERVERLESS_RUNTIME) {
    console.warn("[activity-log] Skipping filesystem append in serverless runtime.");
    return;
  }

  let existing = [];
  try {
    const raw = await fs.readFile(LOGS_PATH, "utf-8");
    existing = JSON.parse(raw);
  } catch {
    // File doesn't exist or is invalid, so start fresh.
  }

  existing.push(...entries);
  await fs.mkdir(path.dirname(LOGS_PATH), { recursive: true });
  await fs.writeFile(LOGS_PATH, JSON.stringify(existing, null, 2));
}

export async function writeLastRunStatus(status) {
  try {
    if (await writeLastRunToSupabase(status)) return;
  } catch (err) {
    console.warn("[activity-log] Supabase last-run write failed:", err.message);
  }

  if (SERVERLESS_RUNTIME) {
    console.warn("[activity-log] Skipping filesystem last-run write in serverless runtime.");
    return;
  }

  await fs.mkdir(path.dirname(LAST_RUN_PATH), { recursive: true });
  await fs.writeFile(
    LAST_RUN_PATH,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      status,
    })
  );
}

export async function listActivityLogs({ page = 1, limit = 10 } = {}) {
  try {
    const supabaseResult = await readLogsFromSupabase({ page, limit });
    if (supabaseResult) return supabaseResult;
  } catch (err) {
    console.warn("[activity-log] Supabase read failed:", err.message);
  }

  if (!SERVERLESS_RUNTIME) {
    try {
      return await readLogsFromFile({ page, limit });
    } catch {
      // Fall through to empty response.
    }
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  return {
    logs: [],
    total: 0,
    page: safePage,
    limit: safeLimit,
    totalPages: 0,
    latestRun: null,
  };
}
