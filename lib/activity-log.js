import fs from "fs/promises";
import path from "path";

const LOGS_PATH = path.join(process.cwd(), "logs", "activity.json");
const LAST_RUN_PATH = path.join(process.cwd(), "logs", "last-run.json");

export async function appendLogs(newEntries) {
  let existing = [];
  try {
    const raw = await fs.readFile(LOGS_PATH, "utf-8");
    existing = JSON.parse(raw);
  } catch {
    // File doesn't exist or is invalid, so start fresh.
  }

  existing.push(...newEntries);
  await fs.mkdir(path.dirname(LOGS_PATH), { recursive: true });
  await fs.writeFile(LOGS_PATH, JSON.stringify(existing, null, 2));
}

export async function writeLastRunStatus(status) {
  await fs.mkdir(path.dirname(LAST_RUN_PATH), { recursive: true });
  await fs.writeFile(
    LAST_RUN_PATH,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      status,
    })
  );
}
