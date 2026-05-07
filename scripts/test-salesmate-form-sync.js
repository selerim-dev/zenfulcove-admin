#!/usr/bin/env node

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("Missing CRON_SECRET. Add it to .env.local.");
  process.exit(1);
}

const isLive = process.argv.includes("--live");

async function main() {
  console.log(
    `Triggering Salesmate Form Sync (${isLive ? "LIVE" : "DRY RUN"}) at`,
    baseUrl + "/api/cron"
  );
  if (!isLive) {
    console.log("No Salesmate contacts will be created. Pass --live to actually create.");
  }
  console.log("");

  const headers = {
    Authorization: `Bearer ${secret}`,
    "X-Automation": "salesmate-sync",
  };
  if (!isLive) headers["X-Dry-Run"] = "true";

  const res = await fetch(baseUrl + "/api/cron", { method: "POST", headers });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Cron failed:", res.status, data.error || res.statusText);
    process.exit(1);
  }

  const logs = Array.isArray(data.logs)
    ? data.logs.filter((log) => log.automation === "Salesmate Form Sync")
    : [];

  console.log("══════ Salesmate Form Sync ══════");
  logs.forEach((log) => {
    console.log(
      `[${String(log.status || "info").toUpperCase()}] (${log.property}) ${log.action}`
    );
  });
  console.log("═════════════════════════════════");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
