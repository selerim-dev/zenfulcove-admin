"use client";

import { useEffect, useMemo, useState } from "react";
import {
  readGuestBookingSession,
  saveGuestBookingSession,
} from "@/components/customer/bookingSession";
import {
  formatMoney,
  type CommerceProduct,
  type CommercePurchase,
} from "@/lib/types";

type Cart = Record<string, number>;

function clean(value: unknown) {
  return String(value || "").trim();
}

function ProductImages({ product }: { product: CommerceProduct }) {
  const [index, setIndex] = useState(0);
  const images = product.image_urls || [];
  const image = images[index] || "";

  if (!image) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-[var(--color-bg)] text-sm text-[var(--color-ink-muted)]">
        No image
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-bg)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt={product.title}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {images.length > 1 ? (
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              setIndex((current) =>
                current === 0 ? images.length - 1 : current - 1
              )
            }
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg font-semibold text-[var(--color-ink)] shadow-sm transition hover:bg-white"
            aria-label="Previous image"
          >
            {"<"}
          </button>
          <div className="flex gap-1.5 rounded-full bg-white/90 px-2 py-1 shadow-sm">
            {images.map((url, dotIndex) => (
              <button
                key={url}
                type="button"
                onClick={() => setIndex(dotIndex)}
                className={`h-2 w-2 rounded-full ${
                  dotIndex === index
                    ? "bg-[var(--color-accent)]"
                    : "bg-[var(--color-border)]"
                }`}
                aria-label={`Show image ${dotIndex + 1}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setIndex((current) =>
                current === images.length - 1 ? 0 : current + 1
              )
            }
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg font-semibold text-[var(--color-ink)] shadow-sm transition hover:bg-white"
            aria-label="Next image"
          >
            {">"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function ProductsStorefront({
  products,
  initialReservation = "",
  initialLastName = "",
}: {
  products: CommerceProduct[];
  initialReservation?: string;
  initialLastName?: string;
}) {
  const [reservation, setReservation] = useState(initialReservation);
  const [lastName, setLastName] = useState(initialLastName);
  const [cart, setCart] = useState<Cart>({});
  const [purchases, setPurchases] = useState<CommercePurchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const displayProducts = useMemo(() => products, [products]);

  useEffect(() => {
    const saved = readGuestBookingSession();
    if (!saved) return;
    if (!initialReservation) {
      setReservation(saved.reservation);
    }
    if (
      !initialLastName &&
      saved.lastName &&
      (!initialReservation || saved.reservation === initialReservation)
    ) {
      setLastName(saved.lastName);
    }
  }, [initialReservation, initialLastName]);

  useEffect(() => {
    const r = clean(reservation);
    const l = clean(lastName);
    if (!r || !l) {
      setPurchases([]);
      return;
    }

    saveGuestBookingSession({ reservation: r, lastName: l });
    let active = true;
    setLoadingPurchases(true);
    setPurchaseError("");

    fetch("/api/commerce/purchases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reservationId: r, lastName: l }),
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!active) return;
        if (!ok) throw new Error(json.error || "Could not load purchases.");
        setPurchases(Array.isArray(json.purchases) ? json.purchases : []);
      })
      .catch((err) => {
        if (!active) return;
        setPurchaseError(
          err instanceof Error ? err.message : "Could not load purchases."
        );
      })
      .finally(() => {
        if (active) setLoadingPurchases(false);
      });

    return () => {
      active = false;
    };
  }, [reservation, lastName]);

  const productById = useMemo(
    () => new Map(displayProducts.map((product) => [product.id, product])),
    [displayProducts]
  );
  const cartRows = Object.entries(cart)
    .map(([productId, quantity]) => {
      const product = productById.get(productId);
      if (!product || quantity <= 0) return null;
      return { product, quantity };
    })
    .filter((row): row is { product: CommerceProduct; quantity: number } =>
      Boolean(row)
    );
  const cartTotal = cartRows.reduce(
    (sum, row) => sum + row.product.price_cents * row.quantity,
    0
  );

  function setQuantity(productId: string, quantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[productId];
      else next[productId] = Math.min(99, Math.floor(quantity));
      return next;
    });
  }

  async function handleCheckout() {
    const r = clean(reservation);
    const l = clean(lastName);
    if (!r || !l || cartRows.length === 0 || checkingOut) return;

    setCheckingOut(true);
    setCheckoutError("");
    try {
      const res = await fetch("/api/commerce/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reservationId: r,
          lastName: l,
          items: cartRows.map((row) => ({
            productId: row.product.id,
            quantity: row.quantity,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Checkout failed.");
      if (typeof json.checkoutUrl === "string" && json.checkoutUrl) {
        window.location.assign(json.checkoutUrl);
        return;
      }
      throw new Error("Checkout did not return a redirect URL.");
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout failed.");
      setCheckingOut(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white shadow-sm">
        <div
          className="min-h-[240px] bg-cover bg-center"
          style={{ backgroundImage: "url(/landing.jpg)" }}
        >
          <div className="flex min-h-[240px] flex-col justify-end bg-black/35 p-6 text-white md:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/85">
              Special Packages
            </p>
            <h1 className="mt-2 max-w-3xl font-serif text-4xl font-medium leading-[1.02] tracking-tight md:text-5xl">
              Add something extra.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/90">
              Choose packages and add-ons for your stay, then check out securely
              through Stripe.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {displayProducts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-ink-muted)]">
              Packages are not available yet.
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {displayProducts.map((product) => {
                const quantity = cart[product.id] || 0;
                return (
                  <article
                    key={product.id}
                    className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-sm"
                  >
                    <ProductImages product={product} />
                    <div className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="font-serif text-2xl font-medium tracking-tight">
                            {product.title}
                          </h2>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
                            {product.sku}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-[var(--color-accent-strong)]">
                          {formatMoney(product.price_cents)}
                        </p>
                      </div>
                      <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-ink-muted)]">
                        {product.description}
                      </p>
                      {quantity > 0 ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="inline-flex items-center overflow-hidden rounded-full border border-[var(--color-border)] bg-white">
                            <button
                              type="button"
                              onClick={() =>
                                setQuantity(product.id, quantity - 1)
                              }
                              className="h-10 w-10 text-lg font-semibold transition hover:bg-[var(--color-bg)]"
                              aria-label={`Remove ${product.title}`}
                            >
                              -
                            </button>
                            <span className="min-w-10 text-center text-sm font-semibold">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setQuantity(product.id, quantity + 1)
                              }
                              className="h-10 w-10 text-lg font-semibold transition hover:bg-[var(--color-bg)]"
                              aria-label={`Add another ${product.title}`}
                            >
                              +
                            </button>
                          </div>
                          <p className="text-sm font-semibold text-[var(--color-ink)]">
                            {formatMoney(product.price_cents * quantity)}
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setQuantity(product.id, 1)}
                          className="w-full rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
                        >
                          Add to cart
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h2 className="font-serif text-2xl font-medium tracking-tight">
              Checkout
            </h2>
            <div className="mt-4 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-[var(--color-ink-muted)]">
                  Reservation Number
                </span>
                <input
                  type="text"
                  value={reservation}
                  onChange={(e) => setReservation(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-[var(--color-accent)]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-[var(--color-ink-muted)]">
                  Last Name
                </span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-[var(--color-accent)]"
                />
              </label>
            </div>

            <div className="mt-5 divide-y divide-[var(--color-border)]">
              {cartRows.length > 0 ? (
                cartRows.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{product.title}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {quantity} x {formatMoney(product.price_cents)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">
                      {formatMoney(product.price_cents * quantity)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-4 text-sm text-[var(--color-ink-muted)]">
                  Your cart is empty.
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-ink-muted)]">
                Total
              </span>
              <span className="text-xl font-semibold">
                {formatMoney(cartTotal)}
              </span>
            </div>

            {checkoutError ? (
              <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {checkoutError}
              </p>
            ) : null}

            <button
              type="button"
              disabled={
                checkingOut ||
                cartRows.length === 0 ||
                !clean(reservation) ||
                !clean(lastName)
              }
              onClick={handleCheckout}
              className="mt-5 w-full rounded-full bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checkingOut ? "Opening checkout..." : "Checkout with Stripe"}
            </button>
          </section>

          <section className="rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
            <h2 className="font-serif text-2xl font-medium tracking-tight">
              Purchases
            </h2>
            {loadingPurchases ? (
              <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
                Loading purchases...
              </p>
            ) : purchaseError ? (
              <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {purchaseError}
              </p>
            ) : purchases.length > 0 ? (
              <div className="mt-4 divide-y divide-[var(--color-border)]">
                {purchases.map((purchase) => (
                  <div key={purchase.id} className="py-3 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {formatMoney(purchase.amount_cents)}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                          purchase.status === "paid"
                            ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                            : purchase.status === "pending"
                              ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                              : "bg-[var(--color-bg)] text-[var(--color-ink-muted)] ring-1 ring-[var(--color-border)]"
                        }`}
                      >
                        {purchase.status}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-[var(--color-ink-muted)]">
                      {purchase.items.map((item) => (
                        <li key={`${purchase.id}-${item.product_id}`}>
                          {item.quantity} x {item.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                No purchases are linked to this stay yet.
              </p>
            )}
          </section>
        </aside>
      </section>
    </div>
  );
}
