import Stripe from "stripe";

type KayakStripeMode = "test" | "live";

const cachedStripeClients: Partial<Record<KayakStripeMode, Stripe>> = {};
const CANONICAL_APP_BASE_URL = "https://stay.zenfulcove.com";

/**
 * Marker stamped onto every Checkout Session this app (the guest portal)
 * creates, written to `metadata.app`. The Zenfulcove marketing site shares
 * this same Stripe account, so Stripe fans out `checkout.session.*` events to
 * every webhook endpoint on the account — including ours. We tag our own
 * sessions with this marker and filter on it so we only ever act on our own.
 */
export const APP_STRIPE_METADATA_MARKER = "zenfulcove-portal";

/**
 * `metadata.product` values that belong to OTHER apps on the shared Stripe
 * account and must never be processed here (e.g. the marketing site's gift
 * cards are tagged `product: "zenfulcove-gift-card"`).
 */
const FOREIGN_STRIPE_PRODUCTS = new Set(["zenfulcove-gift-card"]);

/**
 * Returns true only when the given session metadata identifies a Checkout
 * Session created by THIS app. Used by the webhook to ignore foreign sessions
 * (returning 200 without acting). Robust both ways: it rejects known foreign
 * products and requires either our app marker or a `kind` this app sets.
 */
export function isOwnStripeSessionMetadata(
  metadata: Record<string, string> | null | undefined
): boolean {
  const product = metadata?.product?.trim();
  if (product && FOREIGN_STRIPE_PRODUCTS.has(product)) return false;

  if (metadata?.app === APP_STRIPE_METADATA_MARKER) return true;

  // Backward compatible: sessions created before the `app` marker was added
  // (including any in flight during deploy) still carry a kind we set.
  const kind = metadata?.kind;
  return kind === "kayak_booking" || kind === "commerce_purchase";
}

function truthyEnv(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

export function getKayakStripeMode(): KayakStripeMode {
  const mode = String(process.env.KAYAK_STRIPE_MODE || "test")
    .trim()
    .toLowerCase();
  if (mode === "live") return "live";
  if (mode === "test") return "test";
  throw new Error("KAYAK_STRIPE_MODE must be either test or live.");
}

export function isKayakPaidCheckoutEnabled() {
  return truthyEnv(process.env.KAYAK_PAID_CHECKOUT_ENABLED);
}

/**
 * Stripe mode for the In-Cabin Massage feature, independent of
 * KAYAK_STRIPE_MODE so massage can stay in test mode while kayaks/commerce run
 * live. Defaults to "test" when unset (safe for testing).
 */
export function getMassageStripeMode(): KayakStripeMode {
  const mode = String(process.env.MASSAGE_STRIPE_MODE || "test")
    .trim()
    .toLowerCase();
  if (mode === "live") return "live";
  if (mode === "test") return "test";
  throw new Error("MASSAGE_STRIPE_MODE must be either test or live.");
}

function stripeSecretKey(mode = getKayakStripeMode()) {
  if (mode === "live") {
    return process.env.STRIPE_LIVE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  }
  return process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
}

function stripeWebhookSecret(mode = getKayakStripeMode()) {
  if (mode === "live") {
    return (
      process.env.STRIPE_LIVE_WEBHOOK_SECRET ||
      process.env.STRIPE_WEBHOOK_SECRET
    );
  }
  return (
    process.env.STRIPE_TEST_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET
  );
}

export function hasStripeSecretEnv(mode = getKayakStripeMode()) {
  return Boolean(stripeSecretKey(mode));
}

/**
 * All distinct webhook signing secrets configured (live + test + generic). The
 * single webhook endpoint can receive events from BOTH modes at once — e.g.
 * live kayak/commerce and test massage — so the handler verifies against each.
 */
export function stripeWebhookSecrets(): string[] {
  const secrets = [
    process.env.STRIPE_LIVE_WEBHOOK_SECRET,
    process.env.STRIPE_TEST_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return Array.from(new Set(secrets));
}

export function hasStripeWebhookEnv() {
  return Boolean(stripeWebhookSecret());
}

export function createStripeClient(mode = getKayakStripeMode()) {
  const secretKey = stripeSecretKey(mode);
  if (!secretKey) {
    throw new Error(
      mode === "live"
        ? "STRIPE_LIVE_SECRET_KEY is not set."
        : "STRIPE_TEST_SECRET_KEY is not set."
    );
  }

  if (!cachedStripeClients[mode]) {
    cachedStripeClients[mode] = new Stripe(secretKey, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
      maxNetworkRetries: 2,
    });
  }

  return cachedStripeClients[mode];
}

export function getStripeWebhookSecret(mode = getKayakStripeMode()) {
  const secret = stripeWebhookSecret(mode);
  if (!secret) {
    throw new Error(
      mode === "live"
        ? "STRIPE_LIVE_WEBHOOK_SECRET is not set."
        : "STRIPE_TEST_WEBHOOK_SECRET is not set."
    );
  }
  return secret;
}

export function getAppBaseUrl(request?: Request) {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL;

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (process.env.VERCEL_ENV === "production") {
    return CANONICAL_APP_BASE_URL;
  }

  if (request) {
    return new URL(request.url).origin.replace(/\/+$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  }

  return "http://localhost:3001";
}
