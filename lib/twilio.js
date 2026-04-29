import {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
} from "@/config/keys";

function encodeBasicAuth(accountSid, authToken) {
  return Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

function toFormUrlEncoded(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

export function validateTwilioConfig(fromNumber = TWILIO_FROM_NUMBER) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio env vars are incomplete. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
  }

  if (!fromNumber) {
    throw new Error("Twilio sender is incomplete. Set TWILIO_FROM_NUMBER or this automation's sender number.");
  }
}

export async function sendSms({ to, body, from }) {
  const fromNumber = String(from || TWILIO_FROM_NUMBER || "").trim();
  validateTwilioConfig(fromNumber);

  if (!to) {
    throw new Error("Cannot send SMS without a destination phone number.");
  }

  if (!body || !String(body).trim()) {
    throw new Error("Cannot send SMS without a message body.");
  }

  const payload = {
    To: String(to).trim(),
    Body: String(body).trim(),
  };

  payload.From = fromNumber;

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${encodeBasicAuth(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: toFormUrlEncoded(payload),
    }
  );

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new Error(`Twilio SMS failed: ${res.status} ${res.statusText} ${text}`);
  }

  return data;
}
