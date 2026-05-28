import Stripe from "stripe";

type KayakStripeMode = "test" | "live";

const cachedStripeClients: Partial<Record<KayakStripeMode, Stripe>> = {};
const CANONICAL_APP_BASE_URL = "https://stay.zenfulcove.com";

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

export function hasStripeSecretEnv() {
  return Boolean(stripeSecretKey());
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
