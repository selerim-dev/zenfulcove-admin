import Link from "next/link";
import { PROPERTY_TIMEZONE } from "@/lib/dates";
import { getMassageBooking } from "@/lib/spaBookings";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { formatMoney, type MassageBooking } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Massage booking · Zenfulcove Glamping",
};

function whenLabel(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: PROPERTY_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Tone = "pending" | "success" | "error";

function statusView(booking: MassageBooking): {
  tone: Tone;
  title: string;
  body: string;
  showRebook: boolean;
} {
  switch (booking.status) {
    case "confirmed":
    case "completed":
      return {
        tone: "success",
        title: "Your massage is confirmed",
        body: "Your therapist will arrive at your cabin at the scheduled time. We'll send a reminder through your stay messages.",
        showRebook: false,
      };
    case "pending_therapist":
      return {
        tone: "pending",
        title: "Payment received — confirming your therapist",
        body: "Your therapist has been notified and will confirm shortly (usually within 30 minutes). We'll message you as soon as it's confirmed. If the time isn't available, you'll be refunded automatically.",
        showRebook: false,
      };
    case "pending_payment":
      return {
        tone: "pending",
        title: "Finishing your payment",
        body: "We're waiting for your payment to complete. If you just paid, this page will update shortly.",
        showRebook: false,
      };
    case "declined":
    case "expired":
      return {
        tone: "error",
        title: "That time wasn't available",
        body: "Unfortunately your therapist couldn't take that time. Your payment has been refunded — please choose another available time.",
        showRebook: true,
      };
    case "cancelled":
    default:
      return {
        tone: "error",
        title: "This booking was cancelled",
        body: "This massage booking is no longer active. If you were charged, a refund has been issued. You're welcome to book another time.",
        showRebook: true,
      };
  }
}

const TONE_STYLES: Record<Tone, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  error: "bg-red-50 text-red-700 ring-red-200",
};

export default async function MassageConfirmationPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const booking = hasSupabaseAdminEnv()
    ? await getMassageBooking(bookingId)
    : null;

  if (!booking) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="rounded-3xl border border-[var(--color-border)] bg-white p-8 text-center shadow-sm">
          <h1 className="font-serif text-3xl font-medium tracking-tight">
            Booking not found
          </h1>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            We couldn&apos;t find that massage booking.
          </p>
          <Link
            href="/spa"
            className="mt-6 inline-flex rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
          >
            Book a massage
          </Link>
        </div>
      </div>
    );
  }

  const view = statusView(booking);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="rounded-3xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1 ${TONE_STYLES[view.tone]}`}
        >
          {view.title}
        </span>
        <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          {view.body}
        </p>

        <dl className="mt-6 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)]">
          <Row label="Service" value={booking.service_label} />
          <Row label="When" value={whenLabel(booking.starts_at)} />
          {booking.stay_location ? (
            <Row label="Cabin" value={booking.stay_location} />
          ) : null}
          <Row label="Total" value={formatMoney(booking.amount_cents)} />
        </dl>

        {view.showRebook ? (
          <Link
            href="/spa"
            className="mt-6 inline-flex w-full justify-center rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
          >
            Pick another time
          </Link>
        ) : (
          <Link
            href="/book"
            className="mt-6 inline-flex w-full justify-center rounded-full border border-[var(--color-border)] bg-white px-6 py-3 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Back to my stay
          </Link>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
        {label}
      </span>
      <span className="text-right text-sm font-medium text-[var(--color-ink)]">
        {value}
      </span>
    </div>
  );
}
