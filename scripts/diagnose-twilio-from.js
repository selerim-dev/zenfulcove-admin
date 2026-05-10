#!/usr/bin/env node

const NUMBER_TO_CHECK = process.argv[2] || "+13256665058";

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const envFrom = process.env.TWILIO_FROM_NUMBER;

if (!sid || !token) {
  console.error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN in env.");
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");

async function get(url) {
  const res = await fetch(url, { headers: { Authorization: auth } });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log(`Twilio Account: ${sid}`);
  console.log(`Env TWILIO_FROM_NUMBER: ${envFrom || "(unset)"}`);
  console.log(`Checking number: ${NUMBER_TO_CHECK}`);
  console.log("");

  // 1. Owned numbers (purchased on this account)
  const owned = await get(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(NUMBER_TO_CHECK)}`
  );
  console.log("─── IncomingPhoneNumbers lookup ───");
  console.log("HTTP", owned.status);
  if (owned.ok) {
    const list = owned.data?.incoming_phone_numbers || [];
    if (list.length === 0) {
      console.log(`NOT FOUND on this account as a purchased number.`);
    } else {
      list.forEach((n) => {
        console.log(`Found: ${n.phone_number}  sid=${n.sid}`);
        console.log(`  capabilities: ${JSON.stringify(n.capabilities)}`);
        console.log(`  status: ${n.status}  type: ${n.address_requirements}`);
      });
    }
  } else {
    console.log(JSON.stringify(owned.data, null, 2));
  }
  console.log("");

  // 2. Verified Caller IDs (voice-only outbound)
  const verified = await get(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/OutgoingCallerIds.json?PhoneNumber=${encodeURIComponent(NUMBER_TO_CHECK)}`
  );
  console.log("─── OutgoingCallerIds lookup (voice-only verified IDs) ───");
  console.log("HTTP", verified.status);
  if (verified.ok) {
    const list = verified.data?.outgoing_caller_ids || [];
    if (list.length === 0) {
      console.log("Not a verified outgoing caller ID.");
    } else {
      list.forEach((n) => console.log(`Verified caller ID: ${n.phone_number} (voice-only, NOT usable for SMS)`));
    }
  } else {
    console.log(JSON.stringify(verified.data, null, 2));
  }
  console.log("");

  // 3. Total numbers on the account (so we know we hit the right account)
  const all = await get(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=50`
  );
  console.log("─── All purchased numbers on this account ───");
  if (all.ok) {
    const list = all.data?.incoming_phone_numbers || [];
    console.log(`Count: ${list.length}`);
    list.forEach((n) => console.log(`  ${n.phone_number}  sms=${n.capabilities?.sms} voice=${n.capabilities?.voice}`));
  } else {
    console.log("HTTP", all.status, JSON.stringify(all.data, null, 2));
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
