import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { createStripeClient, hasStripeSecretEnv } from "@/lib/stripe";
import { verifyBookingCancelToken } from "@/lib/bookingCancelToken";
import {
  bookingIdsFromStripeMetadata,
  sendKayakRentalConfirmationMessage,
} from "@/lib/kayakRentalMessages";

export const dynamic = "force-dynamic";

type BookingForCancel = {
  id: string;
  reference_code: string | null;
  kayak_id: string;
  stripe_checkout_session_id: string | null;
  status: string;
  amount_cents: number;
  starts_at: string;
};

function paymentIntentId(session: Stripe.Checkout.Session) {
  const paymentIntent = session.payment_intent;
  return typeof paymentIntent === "string"
    ? paymentIntent
    : paymentIntent?.id ?? null;
}

function safeRedirectUrl(request: Request, booking?: BookingForCancel | null) {
  const url = new URL(request.url);
  const kayakId = booking?.kayak_id || "";
  const fallback = new URL("/book", url.origin);

  if (!kayakId) {
    fallback.searchParams.set("payment", "cancelled");
    return fallback;
  }

  const redirect = new URL(`/book/${kayakId}`, url.origin);
  const date =
    url.searchParams.get("date") || booking?.starts_at?.slice(0, 10) || "";
  const reservation = url.searchParams.get("reservation") || "";
  const lastName = url.searchParams.get("lastName") || "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    redirect.searchParams.set("date", date);
  }
  if (reservation) redirect.searchParams.set("reservation", reservation);
  if (lastName) redirect.searchParams.set("lastName", lastName);
  redirect.searchParams.set("payment", "cancelled");
  return redirect;
}

async function retrieveAndExpireOpenSession(sessionId: string | null) {
  if (!sessionId || !hasStripeSecretEnv()) return null;

  try {
    const stripe = createStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === "open") {
      await stripe.checkout.sessions.expire(sessionId);
    }
    return session;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.toLowerCase().includes("cannot expire")) {
      console.warn(
        `Could not expire Stripe checkout session ${sessionId}: ${message}`
      );
    }
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.redirect(safeRedirectUrl(request));
  }

  const supabase = createSupabaseAdminClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, kayak_id, stripe_checkout_session_id, status, amount_cents, starts_at"
    )
    .eq("id", bookingId)
    .maybeSingle();

  const typedBooking = booking as BookingForCancel | null;
  const token = new URL(request.url).searchParams.get("token") || "";
  const isValidToken = Boolean(
    typedBooking?.reference_code &&
      verifyBookingCancelToken({
        bookingId: typedBooking.id,
        referenceCode: typedBooking.reference_code,
        kayakId: typedBooking.kayak_id,
        token,
      })
  );

  if (
    typedBooking &&
    isValidToken &&
    typedBooking.status === "pending" &&
    Number(typedBooking.amount_cents) > 0
  ) {
    const stripeSession = await retrieveAndExpireOpenSession(
      typedBooking.stripe_checkout_session_id
    );

    if (stripeSession?.payment_status === "paid") {
      const bookingIds = bookingIdsFromStripeMetadata(
        stripeSession.metadata,
        typedBooking.id
      );
      await supabase
        .from("bookings")
        .update({
          status: "confirmed",
          stripe_payment_intent_id: paymentIntentId(stripeSession),
          customer_email: stripeSession.customer_details?.email || null,
          customer_phone: stripeSession.customer_details?.phone || null,
        })
        .in("id", bookingIds.length > 0 ? bookingIds : [typedBooking.id])
        .eq("status", "pending");

      await sendKayakRentalConfirmationMessage(
        supabase,
        bookingIds.length > 0 ? bookingIds : [typedBooking.id]
      ).catch((err) => {
        console.error(
          `Could not send Lodgify kayak rental message for ${stripeSession.id}:`,
          err
        );
      });

      const confirmationUrl = new URL(
        `/book/confirmation/${typedBooking.id}`,
        new URL(request.url).origin
      );
      confirmationUrl.searchParams.set("session_id", stripeSession.id);
      return NextResponse.redirect(confirmationUrl);
    }

    await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        notes: "Customer cancelled Stripe checkout before payment was completed.",
      })
      .in(
        "id",
        bookingIdsFromStripeMetadata(stripeSession?.metadata, typedBooking.id)
      )
      .eq("status", "pending");
  }

  return NextResponse.redirect(safeRedirectUrl(request, typedBooking));
}
