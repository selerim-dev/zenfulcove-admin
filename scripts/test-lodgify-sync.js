#!/usr/bin/env node

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3004";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("Missing CRON_SECRET. Add it to .env.local.");
  process.exit(1);
}

async function main() {
  console.log("Triggering Lodgify Client Sync (DRY RUN) at", baseUrl + "/api/cron");
  console.log("No SendGrid contacts will be written.");

  const res = await fetch(baseUrl + "/api/cron", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "X-Dry-Run": "true",
      "X-Automation": "lodgify-sync",
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Cron failed:", res.status, data.error || res.statusText);
    process.exit(1);
  }

  const logs = Array.isArray(data.logs)
    ? data.logs.filter((log) => log.automation === "Lodgify Client Sync")
    : [];
  const summary = logs.filter(
    (log) =>
      log.status === "failed" ||
      /Loaded |Prepared |No eligible|Skipped/.test(String(log.action || ""))
  );

  console.log("══════ Lodgify Client Sync Dry Run ══════");
  summary.forEach((log) => {
    console.log(`[${String(log.status || "info").toUpperCase()}] ${log.action}`);
  });
  console.log("Detailed recipient rows are intentionally omitted from console output.");
  console.log("═════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
