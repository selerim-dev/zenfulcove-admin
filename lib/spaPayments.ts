import {
  createStripeClient,
  getKayakStripeMode,
  hasStripeSecretEnv,
} from "@/lib/stripe";

/**
 * Refund a massage booking's captured payment in full. Returns the refund id,
 * or null when there's nothing to refund / Stripe isn't configured. Safe to
 * call from the webhook race path, the therapist decline link, the expiry cron,
 * and admin cancel — all of which need the same "give the money back" behavior.
 */
export async function refundMassagePayment(
  paymentIntentId: string | null | undefined
): Promise<string | null> {
  const intent = String(paymentIntentId || "").trim();
  if (!intent || !hasStripeSecretEnv()) return null;
  const stripe = createStripeClient(getKayakStripeMode());
  const refund = await stripe.refunds.create({ payment_intent: intent });
  return refund.id;
}
