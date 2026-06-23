import { createHmac, timingSafeEqual } from "node:crypto";

// HMAC tokens for the therapist's one-tap Accept / Decline SMS links. Bound to
// the action so an "accept" token can't be replayed as a "decline". Same
// server-secret approach as lib/bookingCancelToken.ts.

export type SpaAction = "accept" | "decline";

function tokenSecret() {
  return (
    process.env.CRON_SECRET ||
    process.env.STRIPE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ADMIN_PASSWORD ||
    ""
  );
}

export function hasSpaActionTokenSecret() {
  return Boolean(tokenSecret());
}

export function createSpaActionToken(bookingId: string, action: SpaAction) {
  const secret = tokenSecret();
  if (!secret) {
    throw new Error("No server secret is available for spa action tokens.");
  }
  return createHmac("sha256", secret)
    .update(`${bookingId}:${action}`)
    .digest("base64url");
}

export function verifySpaActionToken(
  bookingId: string,
  action: SpaAction,
  token: string
) {
  const provided = String(token || "").trim();
  if (!provided || !hasSpaActionTokenSecret()) return false;

  const expected = createSpaActionToken(bookingId, action);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
