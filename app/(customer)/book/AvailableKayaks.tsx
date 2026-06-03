"use client";

import { useMemo, useState } from "react";
import BookingModal from "@/components/customer/BookingModal";
import KayakCard from "./KayakCard";
import { formatMoney, type Kayak } from "@/lib/types";

export default function AvailableKayaks({
  kayaks,
  bookedIds,
  dateIso,
  reservation,
  lastName,
}: {
  kayaks: Kayak[];
  bookedIds: string[];
  dateIso: string;
  reservation?: string;
  lastName?: string;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const bookedSet = useMemo(() => new Set(bookedIds), [bookedIds]);
  const selectedKayaks = kayaks.filter((kayak) => selectedIds.includes(kayak.id));
  const total = selectedKayaks.reduce(
    (sum, kayak) => sum + Number(kayak.daily_rate_cents || 0),
    0
  );

  function toggleKayak(kayak: Kayak) {
    if (bookedSet.has(kayak.id)) return;
    setSelectedIds((current) =>
      current.includes(kayak.id)
        ? current.filter((id) => id !== kayak.id)
        : [...current, kayak.id]
    );
  }

  function closeCheckout() {
    setCheckoutOpen(false);
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kayaks.map((k) => {
          const isOut = bookedSet.has(k.id);
          const isSelected = selectedIds.includes(k.id);
          return (
            <KayakCard
              key={k.id}
              kayak={k}
              isOut={isOut}
              isSelected={isSelected}
              onClick={isOut ? undefined : () => toggleKayak(k)}
            />
          );
        })}
      </div>

      <div className="sticky bottom-4 z-20 mt-5 rounded-2xl border border-[var(--color-border)] bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              Selected rentals
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--color-ink)]">
              {selectedKayaks.length === 0
                ? "Choose one or more kayaks"
                : `${selectedKayaks.length} ${
                    selectedKayaks.length === 1 ? "kayak" : "kayaks"
                  } · ${formatMoney(total)}`}
            </p>
          </div>
          <button
            type="button"
            disabled={selectedKayaks.length === 0}
            onClick={() => setCheckoutOpen(true)}
            className="inline-flex cursor-pointer items-center justify-center rounded-full bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reserve selected
          </button>
        </div>
      </div>

      <BookingModal
        kayaks={selectedKayaks}
        dateIso={dateIso}
        open={checkoutOpen && selectedKayaks.length > 0}
        onClose={closeCheckout}
        initialReservation={reservation}
        initialLastName={lastName}
      />
    </>
  );
}
