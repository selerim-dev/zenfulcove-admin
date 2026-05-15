"use client";

import { useState } from "react";
import Modal from "@/components/customer/Modal";
import KayakIllustration from "@/components/customer/KayakIllustration";
import { deleteBooking } from "./actions";
import {
  colorLabel,
  formatMoney,
  type Booking,
  type Kayak,
} from "@/lib/types";
import { PROPERTY_TIMEZONE } from "@/lib/dates";

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: PROPERTY_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLongDateInProperty(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: PROPERTY_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function BookingsTable({
  bookings,
  kayaks,
}: {
  bookings: Booking[];
  kayaks: Kayak[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [active, setActive] = useState<Booking | null>(null);

  const kayakById = new Map(kayaks.map((k) => [k.id, k]));

  async function handleDelete(b: Booking) {
    const label = b.customer_name || "this booking";
    if (
      !window.confirm(
        `Delete booking for ${label}? The kayak becomes available again.`
      )
    ) {
      return;
    }
    setError(null);
    setDeletingId(b.id);
    try {
      await deleteBooking(b.id);
      setActive(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  function openBooking(b: Booking) {
    setActive(b);
  }

  if (bookings.length === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-sm text-[var(--color-ink-muted)]">
        No bookings yet.
      </p>
    );
  }

  return (
    <>
      <div className="mt-4 space-y-3">
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Stay</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => openBooking(b)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openBooking(b);
                    }
                  }}
                  tabIndex={0}
                  title="Open booking details"
                  className="group cursor-pointer border-t border-[var(--color-border)] transition hover:bg-[var(--color-bg)] focus:bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-accent)]/30"
                >
                  <td className="px-4 py-3 transition group-hover:text-[var(--color-accent)]">
                    {formatStamp(b.starts_at)}
                  </td>
                  <td className="px-4 py-3 transition group-hover:text-[var(--color-accent)]">
                    <div className="font-medium">{b.customer_name}</div>
                    {b.customer_email && (
                      <div className="text-xs text-[var(--color-ink-muted)]">
                        {b.customer_email}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink-muted)] transition group-hover:text-[var(--color-accent)]">
                    {b.stay_location ?? "—"}
                  </td>
                  <td className="px-4 py-3 capitalize transition group-hover:text-[var(--color-accent)]">
                    {b.status}
                  </td>
                  <td className="px-4 py-3 transition group-hover:text-[var(--color-accent)]">
                    {formatMoney(b.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        title={
          active?.reference_code
            ? `Booking #${active.reference_code}`
            : "Booking"
        }
      >
        {active && (
          <div className="space-y-5">
            {(() => {
              const k = kayakById.get(active.kayak_id);
              return k ? (
                <header className="flex items-center gap-4 rounded-2xl bg-[var(--color-bg)] p-4">
                  <KayakIllustration
                    color={k.color}
                    capacity={k.capacity}
                    className="h-10 w-auto shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-lg font-medium tracking-tight">
                      {k.name}
                    </p>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      {colorLabel(k.color)}
                      {k.length_feet ? ` · ${k.length_feet} ft` : ""} ·{" "}
                      {k.capacity === 1 ? "Solo" : `${k.capacity}-seat`}
                    </p>
                  </div>
                </header>
              ) : null;
            })()}

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
              <DetailRow label="Customer" value={active.customer_name} />
              {active.customer_email && (
                <DetailRow label="Email" value={active.customer_email} />
              )}
              {active.customer_phone && (
                <DetailRow label="Phone" value={active.customer_phone} />
              )}
              <DetailRow label="Stay" value={active.stay_location ?? "—"} />
              <DetailRow
                label="Date"
                value={formatLongDateInProperty(active.starts_at)}
              />
              <DetailRow label="Status" value={active.status} />
              <DetailRow
                label="Total"
                value={formatMoney(active.amount_cents)}
              />
              {active.waiver_accepted_at && (
                <DetailRow
                  label="Waiver accepted"
                  value={formatStamp(active.waiver_accepted_at)}
                />
              )}
              <DetailRow
                label="Booked"
                value={formatStamp(active.created_at)}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => handleDelete(active)}
                disabled={deletingId === active.id}
                className="cursor-pointer rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingId === active.id ? "Deleting…" : "Delete booking"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-5 py-3 capitalize first:rounded-t-2xl last:rounded-b-2xl last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
        {label}
      </span>
      <span className="text-right text-sm font-medium normal-case text-[var(--color-ink)]">
        {value}
      </span>
    </div>
  );
}
