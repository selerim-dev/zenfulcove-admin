import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  normalizeCommerceQuantity,
  withDefaultPackageProducts,
} from "@/lib/commerce";
import {
  listCommerceProducts,
  saveCommercePurchase,
} from "@/lib/kv";
import { PROPERTY_TO_CABIN, type CommerceProduct } from "@/lib/types";
import { todayIso } from "@/lib/dates";
import { fetchReservationById, LodgifyError } from "@/lib/customer/lodgify";
import {
  createStripeClient,
  getAppBaseUrl,
  getKayakStripeMode,
  hasStripeSecretEnv,
} from "@/lib/stripe";

type CheckoutPayload = {
  reservationId?: string;
  lastName?: string;
  items?: { productId?: string; quantity?: number }[];
};

function lastNameMatches(
  guestName: string | null | undefined,
  input: string
): boolean {
  if (!guestName) return false;
  const g = guestName.toLowerCase().trim();
  const i = input.toLowerCase().trim();
  if (!i) return false;
  const words = g.split(/\s+/);
  return words.includes(i) || g.endsWith(i);
}

function normalizeCartItems(items: CheckoutPayload["items"]) {
  const quantities = new Map<string, number>();
  for (const item of items || []) {
    const productId = String(item?.productId || "").trim();
    const quantity = normalizeCommerceQuantity(item?.quantity);
    if (!productId || quantity <= 0) continue;
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  return Array.from(quantities.entries()).map(([productId, quantity]) => ({
    productId,
    quantity: Math.min(99, quantity),
  }));
}

export async function POST(req: Request) {
  let body: CheckoutPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const reservationId = String(body.reservationId || "").trim();
  const lastName = String(body.lastName || "").trim();
  const cartItems = normalizeCartItems(body.items);

  if (!reservationId || !lastName) {
    return NextResponse.json(
      { error: "Reservation number and last name are required." },
      { status: 400 }
    );
  }
  if (cartItems.length === 0) {
    return NextResponse.json(
      { error: "Add at least one product to checkout." },
      { status: 400 }
    );
  }
  if (!hasStripeSecretEnv()) {
    const stripeMode = getKayakStripeMode();
    return NextResponse.json(
      { error: `Payment checkout is not configured for ${stripeMode} mode yet.` },
      { status: 503 }
    );
  }

  let reservation;
  try {
    reservation = await fetchReservationById(reservationId);
  } catch (err) {
    const detail = err instanceof LodgifyError ? err.detail : String(err);
    return NextResponse.json(
      { error: `Couldn't reach Lodgify (${detail.slice(0, 120)})` },
      { status: 502 }
    );
  }

  if (!reservation) {
    return NextResponse.json(
      { error: "We couldn't find that reservation." },
      { status: 404 }
    );
  }
  if (!lastNameMatches(reservation.guestName, lastName)) {
    return NextResponse.json(
      { error: "That last name doesn't match the reservation." },
      { status: 401 }
    );
  }
  if (reservation.departureIso < todayIso()) {
    return NextResponse.json(
      { error: "That reservation has already ended." },
      { status: 400 }
    );
  }

  const cabin = PROPERTY_TO_CABIN[reservation.propertyId] || null;
  const products = withDefaultPackageProducts(
    (await listCommerceProducts()) as CommerceProduct[]
  );
  const productsById = new Map(products.map((product) => [product.id, product]));
  const purchaseItems = cartItems.map(({ productId, quantity }) => {
    const product = productsById.get(productId);
    if (!product) return null;
    return {
      product_id: product.id,
      title: product.title,
      sku: product.sku,
      quantity,
      unit_amount_cents: product.price_cents,
      amount_cents: product.price_cents * quantity,
      image_url: product.image_urls[0] || null,
    };
  });

  if (purchaseItems.some((item) => item === null)) {
    return NextResponse.json(
      { error: "One or more products are no longer available." },
      { status: 404 }
    );
  }

  const items = purchaseItems.filter(Boolean) as NonNullable<
    (typeof purchaseItems)[number]
  >[];
  const amountCents = items.reduce((sum, item) => sum + item.amount_cents, 0);
  const now = new Date().toISOString();
  const purchaseId = randomUUID();
  const customerName =
    (reservation.guestName ?? "").trim() || String(body.lastName || "").trim();

  await saveCommercePurchase({
    id: purchaseId,
    reservation_id: reservation.id,
    customer_name: customerName,
    stay_location: cabin,
    status: "pending",
    amount_cents: amountCents,
    items,
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: null,
    customer_email: null,
    customer_phone: null,
    created_at: now,
    updated_at: now,
  });

  const stripe = createStripeClient(getKayakStripeMode());
  const baseUrl = getAppBaseUrl(req);
  const successUrl = `${baseUrl}/special-packages/confirmation/${purchaseId}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelParams = new URLSearchParams({
    reservation: reservationId,
    lastName,
    payment: "cancelled",
  });
  const cancelUrl = `${baseUrl}/special-packages?${cancelParams.toString()}`;
  const metadata = {
    kind: "commerce_purchase",
    purchaseId,
    reservationId: reservation.id,
  };

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: purchaseId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        payment_intent_data: { metadata },
        line_items: items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: "usd",
            unit_amount: item.unit_amount_cents,
            product_data: {
              name: item.title,
              description: item.sku,
              images: item.image_url ? [item.image_url] : undefined,
              metadata: {
                sku: item.sku,
                productId: item.product_id,
              },
            },
          },
        })),
      },
      { idempotencyKey: `commerce-checkout-${purchaseId}` }
    );

    if (!session.url) {
      await saveCommercePurchase({
        id: purchaseId,
        reservation_id: reservation.id,
        customer_name: customerName,
        stay_location: cabin,
        status: "cancelled",
        amount_cents: amountCents,
        items,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: null,
        customer_email: null,
        customer_phone: null,
        created_at: now,
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: "Stripe checkout did not return a redirect URL." },
        { status: 500 }
      );
    }

    await saveCommercePurchase({
      id: purchaseId,
      reservation_id: reservation.id,
      customer_name: customerName,
      stay_location: cabin,
      status: "pending",
      amount_cents: amountCents,
      items,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
      customer_email: null,
      customer_phone: null,
      created_at: now,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      purchaseId,
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
    });
  } catch (err) {
    await saveCommercePurchase({
      id: purchaseId,
      reservation_id: reservation.id,
      customer_name: customerName,
      stay_location: cabin,
      status: "cancelled",
      amount_cents: amountCents,
      items,
      stripe_checkout_session_id: null,
      stripe_payment_intent_id: null,
      customer_email: null,
      customer_phone: null,
      created_at: now,
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Could not start checkout: ${err.message}`
            : "Could not start checkout.",
      },
      { status: 502 }
    );
  }
}
