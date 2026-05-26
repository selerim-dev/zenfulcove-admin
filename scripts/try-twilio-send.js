#!/usr/bin/env node
const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;

const from = process.argv[2] || "+13256665058";
const to = process.argv[3] || "+18327667183";
const body = process.argv[4] || "Zenfulcove Glamping diagnostic - testing From=" + from;

console.log(`Attempting Twilio send`);
console.log(`  Account: ${sid}`);
console.log(`  From: ${from}`);
console.log(`  To:   ${to}`);
console.log(`  Body: ${body}`);
console.log("");

const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
const params = new URLSearchParams({ To: to, From: from, Body: body });
const res = await fetch(
  `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
  {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  }
);
const text = await res.text();
console.log("HTTP", res.status, res.statusText);
console.log(text);
