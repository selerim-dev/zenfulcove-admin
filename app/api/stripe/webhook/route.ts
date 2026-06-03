import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createStripeClient, getStripeWebhookSecret } from "@/lib/stripe";
import {
  bookingIdsFromStripeMetadata,
  sendKayakRentalConfirmationMessage,
} from "@/lib/kayakRentalMessages";

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

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    await confirmPaidSession(event.data.object as Stripe.Checkout.Session);
  }

  if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    await cancelExpiredSession(event.data.object as Stripe.Checkout.Session);
  }

  return NextResponse.json({ received: true });
}
