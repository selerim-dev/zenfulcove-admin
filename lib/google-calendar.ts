import { createSign } from "node:crypto";

// Dependency-free Google Calendar client (matches the lean fetch-based Lodgify /
// Twilio clients in this repo). Authenticates as a service account: the
// therapist shares her calendar with the service-account email — read free/busy
// to hide taken times, and (with "make changes to events") write the
// appointment on accept. No `googleapis` dependency.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar";

type CachedToken = { token: string; expiresAt: number };
let cachedToken: CachedToken | null = null;

function serviceAccountEmail() {
  return String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
}

function serviceAccountPrivateKey() {
  // Vercel env values store the PEM with literal "\n" — restore real newlines.
  return String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "")
    .replace(/\\n/g, "\n")
    .trim();
}

export function hasGoogleCalendarEnv() {
  return Boolean(serviceAccountEmail() && serviceAccountPrivateKey());
}

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildAssertion() {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: serviceAccountEmail(),
      scope: SCOPE,
      aud: TOKEN_URL,
      iat,
      exp,
    })
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(serviceAccountPrivateKey());
  return `${signingInput}.${base64url(signature)}`;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  if (!hasGoogleCalendarEnv()) {
    throw new Error("Google Calendar service account env is not configured.");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildAssertion(),
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Google token exchange failed: ${json.error_description || json.error || res.status}`
    );
  }
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

export type BusyInterval = { start: Date; end: Date };

/**
 * Busy intervals on the therapist's calendar in [timeMin, timeMax). Returns []
 * when Google isn't configured so availability still works off working hours +
 * existing portal bookings (degraded: external conflicts won't be reflected).
 */
export async function getFreeBusy(
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<BusyInterval[]> {
  const id = String(calendarId || "").trim();
  if (!id || !hasGoogleCalendarEnv()) return [];

  const token = await getAccessToken();
  const res = await fetch(`${CALENDAR_BASE}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id }],
    }),
  });
  const json = (await res.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `Google freeBusy failed: ${json.error?.message || res.status}`
    );
  }
  const busy = json.calendars?.[id]?.busy ?? [];
  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

/** Create the appointment on the therapist's calendar. Returns the event id. */
export async function insertCalendarEvent(
  calendarId: string,
  {
    summary,
    description,
    startIso,
    endIso,
    timeZone = "America/Chicago",
  }: {
    summary: string;
    description?: string;
    startIso: string;
    endIso: string;
    timeZone?: string;
  }
): Promise<string | null> {
  const id = String(calendarId || "").trim();
  if (!id || !hasGoogleCalendarEnv()) return null;

  const token = await getAccessToken();
  const res = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(id)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description: description || undefined,
        start: { dateTime: startIso, timeZone },
        end: { dateTime: endIso, timeZone },
      }),
    }
  );
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(
      `Google event insert failed: ${json.error?.message || res.status}`
    );
  }
  return json.id ?? null;
}
