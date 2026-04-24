const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const channel = process.env.PROMOTION_CHANNEL || "sms";
const lists = (process.env.PROMOTION_LISTS || "all-clients")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

async function main() {
  console.log("Triggering One-Off Promotion dry run at", `${BASE_URL}/api/promotions`);
  console.log(`Lists: ${lists.join(", ")} | Channel: ${channel}`);

  const res = await fetch(`${BASE_URL}/api/promotions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "dryRun",
      lists,
      channel,
      subject: process.env.PROMOTION_EMAIL_SUBJECT || "Zenfulcove Promotion Test",
      emailBody:
        process.env.PROMOTION_EMAIL_BODY ||
        "This is a dry-run email body for the one-off promotions flow.",
      smsBody:
        process.env.PROMOTION_SMS_BODY ||
        "This is a dry-run SMS body for the Zenfulcove one-off promotions flow.",
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Promotion dry run failed with ${res.status}`);
  }

  console.log("══════ One-Off Promotion Dry Run ══════");
  for (const log of data.logs || []) {
    console.log(`[${String(log.status || "info").toUpperCase()}] ${log.action}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
