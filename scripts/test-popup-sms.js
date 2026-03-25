#!/usr/bin/env node

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("Missing CRON_SECRET. Add it to .env.local.");
  process.exit(1);
}

async function main() {
  console.log("Triggering Popup Follow Ups (SMS DRY RUN) at", baseUrl + "/api/cron");
  console.log("Only the popup automation will run, scoped to SMS only.");
  console.log("");

  const res = await fetch(baseUrl + "/api/cron", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "X-Automation": "popup",
      "X-Popup-Channel": "sms",
      "X-Dry-Run": "true",
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Cron failed:", res.status, data.error || res.statusText);
    process.exit(1);
  }

  const logs = Array.isArray(data.logs) ? data.logs : [];
  const popupLogs = logs.filter((log) => log.automation === "Popup Follow Ups");

  console.log("Status:", data.status);
  console.log("Timestamp:", data.timestamp);
  console.log("");
  console.log("══════ Popup SMS Dry Run ══════");
  popupLogs.forEach((log) => {
    console.log(`[${log.status.toUpperCase()}] ${log.action}`);
  });
  console.log("══════════════════════════════");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
