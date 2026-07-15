import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommercePurchase } from "@/lib/kv";
import { confirmAndFulfillCommercePurchase } from "@/lib/commerceFulfillment";
import { formatMoney, type CommercePurchase } from "@/lib/types";
import { createStripeClient, hasStripeSecretEnv } from "@/lib/stripe";

export const dynamic = "force-dynamic";

async function confirmPurchaseFromSuccessUrl(
  purchase: CommercePurchase,
  sessionId: string
) {
  if (
    !sessionId ||
    !hasStripeSecretEnv() ||
    purchase.stripe_checkout_session_id !== sessionId
  ) {
    return purchase;
  }

  const stripe = createStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") return purchase;

  return (await confirmAndFulfillCommercePurchase(session)) || purchase;
}

export default async function CommerceConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ purchaseId: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { purchaseId } = await params;
  const { session_id: sessionId = "" } = await searchParams;
  const loaded = (await getCommercePurchase(purchaseId)) as CommercePurchase | null;
  if (!loaded) notFound();

  const purchase = await confirmPurchaseFromSuccessUrl(loaded, sessionId);
  const statusCopy =
    purchase.status === "paid"
      ? "Payment received. Your purchase is confirmed."
      : purchase.status === "pending"
        ? "Payment is still pending. If you already paid, refresh this page in a moment."
        : "This checkout was cancelled.";
  const isPublicPurchase = purchase.channel === "public";
  const returnHref = isPublicPurchase
    ? "/shop"
    : `/special-packages?${new URLSearchParams({
        reservation: purchase.reservation_id,
      }).toString()}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
          Special Packages
        </p>
        <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight">
          Purchase received
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          <strong className="text-[var(--color-ink)]">{statusCopy}</strong>
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        {purchase.items.map((item) => (
          <div
            key={`${purchase.id}-${item.product_id}`}
            className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] p-4 last:border-b-0"
          >
            <div>
              <p className="font-medium text-[var(--color-ink)]">{item.title}</p>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                {item.quantity} x {formatMoney(item.unit_amount_cents)}
              </p>
            </div>
            <p className="font-semibold text-[var(--color-ink)]">
              {formatMoney(item.amount_cents)}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        <span className="text-sm font-medium text-[var(--color-ink-muted)]">
          Total
        </span>
        <span className="text-xl font-semibold text-[var(--color-ink)]">
          {formatMoney(purchase.amount_cents)}
        </span>
      </div>

      <Link
        href={returnHref}
        className="inline-flex rounded-full bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
      >
        {isPublicPurchase ? "Back to shop" : "Back to packages"}
      </Link>
    </div>
  );
}
