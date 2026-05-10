import crypto from "node:crypto";
import {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
} from "@/config/keys";

export const TWILIO_PROMO_FROM_NUMBER = TWILIO_FROM_NUMBER;
export const TWILIO_EVENTS_FROM_NUMBER = process.env.TWILIO_EVENTS_FROM_NUMBER || "";

export function getConfiguredTwilioNumbers() {
  return [
    {
      id: "promo",
      label: "Promotions",
      number: TWILIO_PROMO_FROM_NUMBER || "",
      enabled: Boolean(TWILIO_PROMO_FROM_NUMBER),
      comingSoon: false,
    },
    {
      id: "events",
      label: "Events",
      number: TWILIO_EVENTS_FROM_NUMBER || "",
      enabled: false,
      comingSoon: true,
    },
  ];
}

export function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return raw.replace(/[^\d+]/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

export function validateTwilioSignature({ url, params, signature }) {
  if (!TWILIO_AUTH_TOKEN || !signature) return false;
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, key) => acc + key + params[key], url);
  const expected = crypto
    .createHmac("sha1", TWILIO_AUTH_TOKEN)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

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

async function fetchTwilioMessagesByQuery({ queryString, maxMessages }) {
  const collected = [];
  let pageUri = `/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json?${queryString}&PageSize=1000`;

  while (pageUri && collected.length < maxMessages) {
    const url = `https://api.twilio.com${pageUri}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${encodeBasicAuth(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twilio history fetch failed: ${res.status} ${res.statusText} ${text}`);
    }

    const data = await res.json();
    collected.push(...(data.messages || []));
    pageUri = data.next_page_uri || null;
  }

  return collected;
}

export async function fetchTwilioInboundsForNumber({ twilioNumber, sinceMs, maxMessages = 20000 }) {
  validateTwilioConfig(twilioNumber);
  const sinceParam = new Date(sinceMs || Date.now() - 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return fetchTwilioMessagesByQuery({
    queryString: `To=${encodeURIComponent(twilioNumber)}&DateSent%3E=${sinceParam}`,
    maxMessages,
  });
}

export async function fetchTwilioOutboundToContact({ twilioNumber, contactPhone, sinceMs, maxMessages = 5000 }) {
  validateTwilioConfig(twilioNumber);
  const sinceParam = new Date(sinceMs || Date.now() - 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return fetchTwilioMessagesByQuery({
    queryString: `From=${encodeURIComponent(twilioNumber)}&To=${encodeURIComponent(contactPhone)}&DateSent%3E=${sinceParam}`,
    maxMessages,
  });
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
