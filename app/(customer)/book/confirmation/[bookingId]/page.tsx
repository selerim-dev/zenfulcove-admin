import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { formatMoney, type Booking } from "@/lib/types";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

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

  const booking = data as Booking | null;
  if (!booking) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Reservation received
      </h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        Your booking is{" "}
        <strong className="text-[var(--color-ink)]">{booking.status}</strong>.
        Payment hookup is not wired up yet — once Stripe is connected, this is
        where you&apos;ll be redirected to checkout.
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
