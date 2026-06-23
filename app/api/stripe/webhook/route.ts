import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  createStripeClient,
  getStripeWebhookSecret,
  isOwnStripeSessionMetadata,
} from "@/lib/stripe";
import {
  getCommercePurchase,
  saveCommercePurchase,
} from "@/lib/kv";
import {
  bookingIdsFromStripeMetadata,
  sendKayakRentalConfirmationMessage,
} from "@/lib/kayakRentalMessages";
import {
  getMassageBooking,
  getTherapist,
  updateMassageBooking,
} from "@/lib/spaBookings";
import { refundMassagePayment } from "@/lib/spaPayments";
import {
  notifyGuestRequestReceived,
  notifyGuestUnavailable,
  notifyTherapistOfRequest,
} from "@/lib/spaMessages";

const MASSAGE_RESPONSE_WINDOW_MS = 30 * 60 * 1000;

export const runtime = "nodejs";

function paymentIntentId(session: Stripe.Checkout.Session) {
  const paymentIntent = session.payment_intent;
  return typeof paymentIntent === "string"
    ? paymentIntent
    : paymentIntent?.id ?? null;
}

async function confirmPaidSession(session: Stripe.Checkout.Session) {
  const bookingIds = bookingIdsFromStripeMetadata(
    session.metadata,
    session.client_reference_id
  );
  if (bookingIds.length === 0 || session.payment_status !== "paid") return;

  const supabase = createSupabaseAdminClient();
  const update: Record<string, string | null> = {
    status: "confirmed",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId(session),
  };
  if (session.customer_details?.email) {
    update.customer_email = session.customer_details.email;
  }
  if (session.customer_details?.phone) {
    update.customer_phone = session.customer_details.phone;
  }

  const { data: updated, error } = await supabase
    .from("bookings")
    .update(update)
    .in("id", bookingIds)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error(`Could not confirm kayak checkout ${session.id}:`, error);
    return;
  }

  if ((updated ?? []).length > 0) {
    await sendKayakRentalConfirmationMessage(supabase, bookingIds).catch(
      (err) => {
        console.error(
          `Could not send Lodgify kayak rental message for ${session.id}:`,
          err
        );
      }
    );
  }
}

async function cancelExpiredSession(session: Stripe.Checkout.Session) {
  const bookingIds = bookingIdsFromStripeMetadata(
    session.metadata,
    session.client_reference_id
  );
  if (bookingIds.length === 0) return;

  const supabase = createSupabaseAdminClient();
  await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      notes: "Stripe checkout expired before payment was completed.",
    })
    .in("id", bookingIds)
    .eq("status", "pending");
}

async function confirmCommercePurchase(session: Stripe.Checkout.Session) {
  const purchaseId =
    session.metadata?.purchaseId || session.client_reference_id || "";
  if (!purchaseId || session.payment_status !== "paid") return;

  const purchase = await getCommercePurchase(purchaseId);
  if (!purchase || purchase.status === "paid") return;

  await saveCommercePurchase({
    ...purchase,
    status: "paid",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId(session),
    customer_email: session.customer_details?.email || purchase.customer_email,
    customer_phone: session.customer_details?.phone || purchase.customer_phone,
    updated_at: new Date().toISOString(),
  });
}

async function cancelCommercePurchase(session: Stripe.Checkout.Session) {
  const purchaseId =
    session.metadata?.purchaseId || session.client_reference_id || "";
  if (!purchaseId) return;

  const purchase = await getCommercePurchase(purchaseId);
  if (!purchase || purchase.status !== "pending") return;

  await saveCommercePurchase({
    ...purchase,
    status: "cancelled",
    stripe_checkout_session_id:
      session.id || purchase.stripe_checkout_session_id,
    updated_at: new Date().toISOString(),
  });
}

async function confirmMassageBooking(session: Stripe.Checkout.Session) {
  const bookingId =
    session.metadata?.bookingId || session.client_reference_id || "";
  if (!bookingId || session.payment_status !== "paid") return;

  const booking = await getMassageBooking(bookingId);
  if (!booking || booking.status !== "pending_payment") return;

  const intent = paymentIntentId(session);
  const update = {
    status: "pending_therapist" as const,
    therapist_deadline: new Date(Date.now() + MASSAGE_RESPONSE_WINDOW_MS).toISOString(),
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: intent,
    customer_email: session.customer_details?.email || booking.customer_email,
    customer_phone: session.customer_details?.phone || booking.customer_phone,
  };

  let updated;
  try {
    updated = await updateMassageBooking(bookingId, update, "pending_payment");
  } catch (err) {
    // Slot was taken by another booking during the checkout window — the
    // exclusion constraint blocks the flip. Refund and tell the guest.
    if (err instanceof Error && err.name === "MassageSlotOverlap") {
      let refundId: string | null = null;
      try {
        refundId = await refundMassagePayment(intent);
      } catch (refundErr) {
        console.error(`Could not refund massage ${bookingId}:`, refundErr);
      }
      await updateMassageBooking(
        bookingId,
        {
          status: "declined",
          stripe_payment_intent_id: intent,
          refund_id: refundId,
          notes: "Slot was no longer available at payment; auto-refunded.",
        },
        "pending_payment"
      );
      const fresh = await getMassageBooking(bookingId);
      if (fresh) {
        await notifyGuestUnavailable(fresh, {
          refunded: Boolean(refundId),
        }).catch((e) => console.error(e));
      }
      return;
    }
    throw err;
  }

  if (!updated) return;

  const therapist = await getTherapist(updated.therapist_id);
  if (therapist) {
    await notifyTherapistOfRequest(updated, therapist).catch((err) =>
      console.error(`Could not SMS therapist for ${session.id}:`, err)
    );
  }
  await notifyGuestRequestReceived(updated).catch((err) =>
    console.error(`Could not message guest for ${session.id}:`, err)
  );
}

async function cancelMassageBooking(session: Stripe.Checkout.Session) {
  const bookingId =
    session.metadata?.bookingId || session.client_reference_id || "";
  if (!bookingId) return;
  await updateMassageBooking(
    bookingId,
    {
      status: "cancelled",
      notes: "Stripe checkout expired before payment was completed.",
    },
    "pending_payment"
  );
}

export async function POST(request: Request) {
  const stripe = createStripeClient();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature." },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      getStripeWebhookSecret()
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Invalid Stripe webhook payload.",
      },
      { status: 400 }
    );
  }

  const isCheckoutSessionEvent =
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed";

  if (isCheckoutSessionEvent) {
    const session = event.data.object as Stripe.Checkout.Session;

    // The Zenfulcove marketing site shares this Stripe account (it sells gift
    // cards tagged metadata.product === "zenfulcove-gift-card"), so Stripe
    // delivers its checkout events here too. Ignore anything that isn't ours
    // — acknowledge with 200 so Stripe doesn't retry, but take no action.
    if (!isOwnStripeSessionMetadata(session.metadata)) {
      console.info(
        `Ignoring foreign Stripe session ${session.id} (event=${event.type}, product=${session.metadata?.product ?? "n/a"}, kind=${session.metadata?.kind ?? "n/a"}).`
      );
      return NextResponse.json({ received: true, ignored: true });
    }

    const isPaid =
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded";

    if (session.metadata?.kind === "commerce_purchase") {
      await (isPaid
        ? confirmCommercePurchase(session)
        : cancelCommercePurchase(session));
    } else if (session.metadata?.kind === "massage_booking") {
      await (isPaid
        ? confirmMassageBooking(session)
        : cancelMassageBooking(session));
    } else {
      await (isPaid
        ? confirmPaidSession(session)
        : cancelExpiredSession(session));
    }
  }

  return NextResponse.json({ received: true });
}
