import { createHmac, timingSafeEqual } from "node:crypto";

type BookingCancelTokenInput = {
  bookingId: string;
  referenceCode: string;
  kayakId: string;
};

function tokenSecret() {
  return (
    process.env.CRON_SECRET ||
    process.env.STRIPE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ADMIN_PASSWORD ||
    ""
  );
}

function tokenPayload({ bookingId, referenceCode, kayakId }: BookingCancelTokenInput) {
  return [bookingId, referenceCode, kayakId].join(":");
}

export function hasBookingCancelTokenSecret() {
  return Boolean(tokenSecret());
}

export function createBookingCancelToken(input: BookingCancelTokenInput) {
  const secret = tokenSecret();
  if (!secret) {
    throw new Error("No server secret is available for booking cancel tokens.");
  }

  return createHmac("sha256", secret)
    .update(tokenPayload(input))
    .digest("base64url");
}

export function verifyBookingCancelToken({
  token,
  ...input
}: BookingCancelTokenInput & { token: string }) {
  const provided = String(token || "").trim();
  if (!provided || !hasBookingCancelTokenSecret()) return false;

  const expected = createBookingCancelToken(input);
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
