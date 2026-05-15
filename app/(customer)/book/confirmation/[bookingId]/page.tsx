import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { formatMoney, type Booking } from "@/lib/types";
import { createStripeClient, hasStripeSecretEnv } from "@/lib/stripe";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function confirmCheckoutFromSuccessUrl(booking: Booking, sessionId: string) {
  if (
    !sessionId ||
    !hasStripeSecretEnv() ||
    booking.status !== "pending" ||
    booking.stripe_checkout_session_id !== sessionId
  ) {
    return booking;
  }

  const stripe = createStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") return booking;

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const supabase = createSupabaseAdminClient();
  const update: Record<string, string | null> = {
    status: "confirmed",
    stripe_payment_intent_id: paymentIntentId,
  };
  if (session.customer_details?.email) {
    update.customer_email = session.customer_details.email;
  }
  if (session.customer_details?.phone) {
    update.customer_phone = session.customer_details.phone;
  }

  const { data } = await supabase
    .from("bookings")
    .update(update)
    .eq("id", booking.id)
    .eq("stripe_checkout_session_id", sessionId)
    .select("*")
    .maybeSingle();

  return (data as Booking | null) ?? booking;
}

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { bookingId } = await params;
  const { session_id: sessionId = "" } = await searchParams;

  if (!hasSupabaseAdminEnv()) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-sm leading-relaxed text-[var(--color-ink-muted)]">
        Booking confirmation is installed but not connected in this
        environment. Add the Supabase URL and service-role key, then run the
        migrations in <span className="font-mono">supabase/sql</span>.
      </div>
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  let booking = data as Booking | null;
  if (!booking) notFound();
  booking = await confirmCheckoutFromSuccessUrl(booking, sessionId);

  const { data: kayak } = await supabase
    .from("kayaks")
    .select("name, code")
    .eq("id", booking.kayak_id)
    .maybeSingle();

  const isPaidBooking = booking.amount_cents > 0;
  const statusCopy =
    booking.status === "confirmed"
      ? isPaidBooking
        ? "Payment received. Your rental is confirmed."
        : "Your included rental is confirmed."
      : booking.status === "pending"
        ? "Payment is still pending. If you already paid, refresh this page in a moment."
        : `This rental is ${booking.status}.`;

  return (
    <div className="mx-auto max-w-xl space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Reservation received
      </h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        <strong className="text-[var(--color-ink)]">{statusCopy}</strong>
      </p>
      <dl className="grid gap-3 text-sm">
        <Row label="Booking ID" value={booking.id} />
        <Row
          label="Window"
          value={`${new Date(booking.starts_at).toLocaleString()} → ${new Date(
            booking.ends_at
          ).toLocaleString()}`}
        />
        <Row label="Rate" value={booking.rate_type} />
        <Row label="Total" value={formatMoney(booking.amount_cents)} />
        {kayak?.name ? <Row label="Rental" value={kayak.name} /> : null}
        {booking.status === "confirmed" && kayak?.code ? (
          <Row label="Access Code" value={kayak.code} />
        ) : null}
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2 last:border-0">
      <dt className="text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
