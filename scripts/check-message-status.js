#!/usr/bin/env node
const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");

const messageSids = process.argv.slice(2);
if (messageSids.length === 0) {
  console.error("usage: check-message-status.js <SID> [SID ...]");
  process.exit(1);
}

for (const messageSid of messageSids) {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${messageSid}.json`,
    { headers: { Authorization: auth } }
  );
  const data = await res.json();
  console.log("─── " + messageSid + " ───");
  console.log("from:          " + data.from);
  console.log("to:            " + data.to);
  console.log("status:        " + data.status);
  console.log("error_code:    " + data.error_code);
  console.log("error_message: " + data.error_message);
  console.log("date_sent:     " + data.date_sent);
  console.log("price:         " + data.price);
  console.log("");
}
