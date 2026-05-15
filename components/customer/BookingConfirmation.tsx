"use client";

import { useState } from "react";
import { colorLabel, formatMoney, type BookingSuccess } from "@/lib/types";
import { PROPERTY_TIMEZONE } from "@/lib/dates";

function formatDate(dateIso: string): string {
  return new Date(`${dateIso}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: PROPERTY_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function describeKayak(k: BookingSuccess["kayak"]): string {
  const parts: string[] = [k.name, colorLabel(k.color)];
  if (k.length_feet) parts.push(`${k.length_feet} ft`);
  return parts.join(" · ");
}

export default function BookingConfirmation({
  booking,
  onDone,
}: {
  booking: BookingSuccess;
  onDone?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const code = booking.lockboxCode ?? "—";
  const dateLabel = formatDate(booking.dateIso);
  const paddlers = booking.kayak.capacity;
  const jacketLabel = paddlers === 1 ? "1 jacket" : `${paddlers} jackets`;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)]">
          <svg
            className="h-6 w-6 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        </div>
        <h2 className="font-serif text-3xl font-medium leading-[1.1] tracking-tight md:text-4xl">
          You&apos;re booked, {booking.customerName}.
        </h2>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {booking.kayak.name} is yours for {dateLabel}.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            Access code
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Lockbox
          </span>
        </div>
        <button
          type="button"
          onClick={() => setRevealed(true)}
          disabled={revealed || !booking.lockboxCode}
          className="mx-auto my-5 block w-full cursor-pointer text-center disabled:cursor-default"
        >
          <span
            className={`font-mono text-4xl font-bold tracking-[0.3em] transition-[filter] duration-200 ${
              revealed || !booking.lockboxCode
                ? ""
                : "select-none blur-md"
            }`}
          >
            {code}
          </span>
        </button>
        {!revealed && booking.lockboxCode && (
          <p className="-mt-3 mb-3 text-center text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">
            Tap to reveal
          </p>
        )}
        <p className="text-xs text-[var(--color-ink-muted)]">
          The lockbox is on the kayak&apos;s stern.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <Row label="Kayak" value={describeKayak(booking.kayak)} />
        <Row label="Paddler" value={`${paddlers} (${jacketLabel})`} />
        <Row label="Stay" value={booking.stayLocation} />
        <Row
          label="Total"
          value={
            booking.isComplimentary
              ? "Complimentary"
              : `${formatMoney(booking.amountCents)} · due at checkout`
          }
        />
        <Row label="Booking #" value={`#${booking.referenceCode}`} />
      </div>

      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="w-full cursor-pointer rounded-full bg-[var(--color-accent)] py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
        >
          Done
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3 last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
        {label}
      </span>
      <span className="text-right text-sm font-medium text-[var(--color-ink)]">
        {value}
      </span>
    </div>
  );
}
