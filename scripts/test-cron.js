#!/usr/bin/env node
/**
 * Test script to run the cron automation logic locally.
 *
 * ALWAYS uses dry-run: logs WHO would receive WHAT, no emails sent.
 * Compare output with Lodgify (check-in dates) + Jotform (waiver submissions).
 *
 * Usage:
 *   1. Start the dev server:  npm run dev
 *   2. In another terminal:   npm run test:cron
 *
 * Requires CRON_SECRET in .env.local.
 */

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("❌ Missing CRON_SECRET. Add to .env.local (script loads it via npm run test:cron).");
  process.exit(1);
}

async function main() {
  console.log("🔄 Triggering cron (DRY RUN) at", baseUrl + "/api/cron");
  console.log("   No emails will be sent. Output: WHO would receive WHAT.");
  console.log("");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 min
  const progressId = setInterval(
    () => process.stdout.write("."),
    5000
  );

  let res;
  try {
    res = await fetch(baseUrl + "/api/cron", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Dry-Run": "true",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    clearInterval(progressId);
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("❌ Cron failed:", res.status, data.error || res.statusText);
    process.exit(1);
  }

  console.log("✅ Status:", data.status);
  console.log("   Timestamp:", data.timestamp);
  console.log("");

  // Parse logs and group by day
  const logs = Array.isArray(data.logs) ? data.logs : [];
  const byDay = []; // { date, label, wouldSend: [], skips: [] }
  let currentGroup = null;

  for (const log of logs) {
    if (log.automation !== "Jotform Waiver Emails") continue;
    const a = log.action || "";

    // "--- Check-ins on 2026-03-15 (2 days from now) → would send "2 days before" to: ---"
    const headerMatch = a.match(/^--- Check-ins on (.+?) → would send "([^"]+)" to: ---$/);
    if (headerMatch) {
      currentGroup = { date: headerMatch[1].trim(), label: headerMatch[2], wouldSend: [], skips: [] };
      byDay.push(currentGroup);
      continue;
    }

    // "[DRY RUN] Would send "..." to email | booking X | ..."
    const sendMatch = a.match(/^\[DRY RUN\] Would send "[^"]*" to ([^|]+) \| booking (\d+)/);
    if (sendMatch && currentGroup) {
      currentGroup.wouldSend.push({ email: sendMatch[1].trim(), bookingId: sendMatch[2] });
      continue;
    }

    // "[DRY RUN] SKIP email | booking X | ..." or "SKIP booking X | ..."
    const skipMatch = a.match(/^\[DRY RUN\] SKIP (.+)$/);
    if (skipMatch && currentGroup) {
      currentGroup.skips.push(skipMatch[1].trim());
      continue;
    }
  }

  // Display grouped by day
  console.log("══════ Emails we WOULD send (by check-in date) ══════");
  console.log("");
  for (const g of byDay) {
    console.log(`📅 ${g.date} — "${g.label}"`);
    if (g.wouldSend.length > 0) {
      g.wouldSend.forEach(({ email, bookingId }) =>
        console.log(`   → ${email} (booking ${bookingId})`)
      );
    } else {
      console.log("   (none)");
    }
    if (g.skips.length > 0) {
      g.skips.forEach((s) => console.log(`   ○ SKIP: ${s}`));
    }
    console.log("");
  }
  console.log("════════════════════════════════════════════════");
  console.log("");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  if (err.name === "AbortError") {
    console.error("   Cron timed out after 3 minutes. Check dev server terminal for progress.");
  } else if (err.cause?.code === "ECONNREFUSED") {
    console.error("   Is the dev server running? Start it with: npm run dev");
  }
  process.exit(1);
});
