import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { colorLabel, formatMoney, type Booking } from "@/lib/types";
import { inclusiveDays, PROPERTY_TIMEZONE } from "@/lib/dates";
import { createStripeClient, hasStripeSecretEnv } from "@/lib/stripe";
import {
  bookingIdsFromStripeMetadata,
  sendKayakRentalConfirmationMessage,
} from "@/lib/kayakRentalMessages";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type KayakForConfirmation = {
  id: string;
  name: string;
  code: string | null;
  color: string;
  capacity: number;
  length_feet: number | null;
};

function paymentIntentId(session: Stripe.Checkout.Session) {
  const paymentIntent = session.payment_intent;
  return typeof paymentIntent === "string"
    ? paymentIntent
    : paymentIntent?.id ?? null;
}

function orderBookings(bookings: Booking[], bookingIds: string[]) {
  const byId = new Map(bookings.map((booking) => [booking.id, booking]));
  return bookingIds
    .map((id) => byId.get(id))
    .filter((booking): booking is Booking => Boolean(booking));
}

async function confirmCheckoutFromSuccessUrl(
  primaryBooking: Booking,
  sessionId: string
) {
  const supabase = createSupabaseAdminClient();
  let bookingIds = [primaryBooking.id];

  if (
    sessionId &&
    hasStripeSecretEnv() &&
    primaryBooking.stripe_checkout_session_id === sessionId
  ) {
    const stripe = createStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    bookingIds = bookingIdsFromStripeMetadata(
      session.metadata,
      session.client_reference_id
    );
    if (bookingIds.length === 0) bookingIds = [primaryBooking.id];

    if (session.payment_status === "paid") {
      const update: Record<string, string | null> = {
        status: "confirmed",
        stripe_payment_intent_id: paymentIntentId(session),
      };
      if (session.customer_details?.email) {
        update.customer_email = session.customer_details.email;
      }
      if (session.customer_details?.phone) {
        update.customer_phone = session.customer_details.phone;
      }

      const { data: updated } = await supabase
        .from("bookings")
        .update(update)
        .in("id", bookingIds)
        .eq("status", "pending")
        .select("id");

      if ((updated ?? []).length > 0) {
        await sendKayakRentalConfirmationMessage(supabase, bookingIds).catch(
          (err) => {
            console.error(
              `Could not send Lodgify kayak rental message for ${sessionId}:`,
              err
            );
          }
        );
      }
    }
  }

  const { data } = await supabase
    .from("bookings")
    .select("*")
    .in("id", bookingIds);

  const bookings = orderBookings((data as Booking[] | null) || [], bookingIds);
  return bookings.length > 0 ? bookings : [primaryBooking];
}

function describeKayak(kayak: KayakForConfirmation) {
  const details = [colorLabel(kayak.color)];
  if (kayak.length_feet) details.push(`${kayak.length_feet} ft`);
  details.push(
    `${kayak.capacity} ${kayak.capacity === 1 ? "paddler" : "paddlers"}`
  );
  return `${kayak.name} · ${details.join(" · ")}`;
}

function rentalDatesLabel(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      timeZone: PROPERTY_TIMEZONE,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const days = inclusiveDays(startsAt.slice(0, 10), endsAt.slice(0, 10));
  return days > 1
    ? `${fmt(startsAt)} → ${fmt(endsAt)} · ${days} days`
    : fmt(startsAt);
}

function statusCopy(bookings: Booking[]) {
  const allConfirmed = bookings.every((booking) => booking.status === "confirmed");
  const anyPending = bookings.some((booking) => booking.status === "pending");
  const allPaid = bookings.every((booking) => Number(booking.amount_cents) > 0);

  if (allConfirmed && allPaid) {
    return "Payment received. Your kayak rental is confirmed.";
  }
  if (anyPending) {
    return "Payment is still pending. If you already paid, refresh this page in a moment.";
  }
  return `This rental is ${bookings[0]?.status || "not active"}.`;
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

  const primaryBooking = data as Booking | null;
  if (!primaryBooking) notFound();
  const bookings = await confirmCheckoutFromSuccessUrl(primaryBooking, sessionId);
  const kayakIds = bookings.map((booking) => booking.kayak_id);

  const { data: kayakRows } = await supabase
    .from("kayaks")
    .select("id, name, code, color, capacity, length_feet")
    .in("id", kayakIds);

  const kayaksById = new Map(
    ((kayakRows as KayakForConfirmation[] | null) || []).map((kayak) => [
      kayak.id,
      kayak,
    ])
  );
  const total = bookings.reduce(
    (sum, booking) => sum + Number(booking.amount_cents || 0),
    0
  );
  const first = bookings[0];

  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Reservation received
      </h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        <strong className="text-[var(--color-ink)]">{statusCopy(bookings)}</strong>
      </p>
      <dl className="grid gap-3 text-sm">
        <Row label="Booking ID" value={first.id} />
        <Row
          label="Dates"
          value={rentalDatesLabel(first.starts_at, first.ends_at)}
        />
        <Row label="Rate" value={first.rate_type} />
        <Row label="Total" value={formatMoney(total)} />
      </dl>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        {bookings.map((booking) => {
          const kayak = kayaksById.get(booking.kayak_id);
          return (
            <div
              key={booking.id}
              className="border-b border-[var(--color-border)] p-4 last:border-b-0"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-[var(--color-ink)]">
                    {kayak ? describeKayak(kayak) : "Kayak rental"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    Reference #{booking.reference_code || booking.id}
                  </p>
                </div>
                {booking.status === "confirmed" && kayak?.code ? (
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
                      Lock code
                    </p>
                    <p className="font-mono text-xl font-semibold tracking-[0.18em]">
                      {kayak.code}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
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
