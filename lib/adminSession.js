// Signed admin session tokens for the zc_admin_auth cookie.
//
// The cookie used to be the literal string "true", which anyone could forge
// without knowing the password. Tokens are now "v1.<expiresMs>.<hmac>" where
// the HMAC covers the version + expiry, so a cookie is only valid if it was
// minted server-side after a successful password login and hasn't expired.
//
// No Next.js imports here: this module is also exercised directly by plain
// node during development, and is imported from both route handlers and
// server components/actions via lib/adminAuth.js.

import { createHmac, createHash, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // matches cookie maxAge

// Prefer a dedicated ADMIN_SESSION_SECRET when set; otherwise derive the
// signing key from secrets that already exist in every environment so the
// fix deploys without new Vercel env vars. Changing ADMIN_PASSWORD (or the
// dedicated secret) invalidates all outstanding sessions, which is the
// behavior you want after rotating a password.
function signingKey() {
  const dedicated = String(process.env.ADMIN_SESSION_SECRET || "").trim();
  if (dedicated) return dedicated;

  const password = String(process.env.ADMIN_PASSWORD || "").trim();
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (!password && !cronSecret) return null;
  return createHash("sha256")
    .update(`zc-admin-session\n${password}\n${cronSecret}`)
    .digest("hex");
}

function signPayload(payload, key) {
  return createHmac("sha256", key).update(payload).digest("hex");
}

/**
 * Mint a session token that expires ttlMs from now.
 * Returns null when no signing key material is configured (fail closed).
 */
export function createAdminSessionToken(ttlMs = ADMIN_SESSION_TTL_MS) {
  const key = signingKey();
  if (!key) return null;
  const expiresMs = Date.now() + Number(ttlMs || 0);
  const payload = `${TOKEN_VERSION}.${expiresMs}`;
  return `${payload}.${signPayload(payload, key)}`;
}

/**
 * Verify a token from the cookie: version, expiry, and signature must all
 * check out. Never throws; any malformed/legacy value (e.g. "true") is false.
 */
export function verifyAdminSessionToken(token) {
  const key = signingKey();
  if (!key) return false;

  const parts = String(token || "").split(".");
  if (parts.length !== 3) return false;
  const [version, expiresRaw, signature] = parts;
  if (version !== TOKEN_VERSION) return false;

  const expiresMs = Number(expiresRaw);
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) return false;

  const expected = signPayload(`${version}.${expiresRaw}`, key);
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(String(signature), "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
