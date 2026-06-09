#!/usr/bin/env node

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3004";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("Missing CRON_SECRET. Add it to .env.local.");
  process.exit(1);
}

async function main() {
  console.log("Triggering Event Popup Salesmate SMS (DRY RUN) at", baseUrl + "/api/cron");
  console.log("Only the event popup automation will run. No Salesmate contacts or SMS messages will be created.");
  console.log("");

  const res = await fetch(baseUrl + "/api/cron", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "X-Dry-Run": "true",
      "X-Automation": "event-popup",
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Cron failed:", res.status, data.error || res.statusText);
    process.exit(1);
  }

  const logs = Array.isArray(data.logs)
    ? data.logs.filter((log) => log.automation === "Event Popup Salesmate SMS")
    : [];

  console.log("══════ Event Popup Salesmate SMS Dry Run ══════");
  logs.forEach((log) => {
    console.log(`[${String(log.status || "info").toUpperCase()}] ${log.action}`);
  });
  console.log("═══════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
