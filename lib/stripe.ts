import Stripe from "stripe";

let cachedStripe: Stripe | null = null;

export function hasStripeSecretEnv() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function hasStripeWebhookEnv() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function createStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }

  if (!cachedStripe) {
    cachedStripe = new Stripe(secretKey, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
      maxNetworkRetries: 2,
    });
  }

  return cachedStripe;
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
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

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  }

  if (request) {
    return new URL(request.url).origin.replace(/\/+$/, "");
  }

  return "http://localhost:3001";
}
