"use client";

import { useRef, useState, type RefObject } from "react";
import BookingModal from "@/components/customer/BookingModal";
import KayakIllustration from "@/components/customer/KayakIllustration";
import { colorLabel, formatMoney, type Kayak } from "@/lib/types";

type Day = { iso: string; dow: string; day: number };

function describeKayak(k: Kayak): string {
  const parts: string[] = [colorLabel(k.color)];
  if (k.length_feet) parts.push(`${k.length_feet} ft`);
  parts.push(`${k.capacity} ${k.capacity === 1 ? "paddler" : "paddlers"}`);
  return parts.join(" · ");
}

function formatMonthLabel(dateIso: string): string {
  return new Date(`${dateIso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
  });
}

export default function FleetCalendar({
  kayaks,
  days,
  bookedByKayak,
}: {
  kayaks: Kayak[];
  days: Day[];
  bookedByKayak: Record<string, string[]>;
}) {
  const [active, setActive] = useState<{
    kayaks: Kayak[];
    dateIso: string;
  } | null>(null);
  const [checkoutSelection, setCheckoutSelection] = useState<{
    dateIso: string;
    kayakIds: string[];
  } | null>(null);
  const [selectedKayakId, setSelectedKayakId] = useState(kayaks[0]?.id ?? "");
  const dateRailRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const selectedKayak =
    kayaks.find((kayak) => kayak.id === selectedKayakId) ?? kayaks[0] ?? null;
  const selectedCheckoutKayaks = checkoutSelection
    ? kayaks.filter((kayak) => checkoutSelection.kayakIds.includes(kayak.id))
    : [];
  const checkoutTotal = selectedCheckoutKayaks.reduce(
    (sum, kayak) => sum + Number(kayak.daily_rate_cents || 0),
    0
  );

  function isBooked(kayakId: string, dateIso: string) {
    return (bookedByKayak[kayakId] ?? []).includes(dateIso);
  }

  function isSelectedForCheckout(kayakId: string, dateIso: string) {
    return (
      checkoutSelection?.dateIso === dateIso &&
      checkoutSelection.kayakIds.includes(kayakId)
    );
  }

  function toggleCheckoutSelection(kayak: Kayak, dateIso: string) {
    if (isBooked(kayak.id, dateIso)) return;
    setSelectedKayakId(kayak.id);
    setCheckoutSelection((current) => {
      if (!current || current.dateIso !== dateIso) {
        return { dateIso, kayakIds: [kayak.id] };
      }

      if (current.kayakIds.includes(kayak.id)) {
        const nextIds = current.kayakIds.filter((id) => id !== kayak.id);
        return nextIds.length > 0 ? { dateIso, kayakIds: nextIds } : null;
      }

      return { dateIso, kayakIds: [...current.kayakIds, kayak.id] };
    });
  }

  function openSelectedCheckout() {
    if (!checkoutSelection || selectedCheckoutKayaks.length === 0) return;
    setActive({
      dateIso: checkoutSelection.dateIso,
      kayaks: selectedCheckoutKayaks,
    });
  }

  function scrollByPage(
    ref: RefObject<HTMLDivElement | null>,
    direction: -1 | 1
  ) {
    const node = ref.current;
    if (!node) return;
    node.scrollBy({
      left: direction * Math.max(320, node.clientWidth * 0.8),
      behavior: "smooth",
    });
  }

  return (
    <>
      {selectedKayak ? (
        <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[minmax(260px,360px)_1fr]">
            <div className="relative min-h-[220px] bg-[var(--color-bg)]">
              {selectedKayak.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedKayak.image_url}
                  alt={selectedKayak.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full min-h-[220px] items-center justify-center">
                  <KayakIllustration
                    color={selectedKayak.color}
                    capacity={selectedKayak.capacity}
                    className="h-24 w-auto"
                  />
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-5 p-5 md:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
                    Selected Rental
                  </p>
                  <h2 className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight">
                    {selectedKayak.name}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                    {describeKayak(selectedKayak)}
                  </p>
                </div>
                <p className="shrink-0 rounded-full bg-[var(--color-bg)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-strong)]">
                  {formatMoney(selectedKayak.daily_rate_cents)}/day
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                    Pick a Date
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => scrollByPage(dateRailRef, -1)}
                      className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                    >
                      Earlier
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollByPage(dateRailRef, 1)}
                      className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                    >
                      Later
                    </button>
                  </div>
                </div>
                <div
                  ref={dateRailRef}
                  className="mt-3 max-w-full overflow-x-auto pb-3"
                  aria-label={`${selectedKayak.name} available dates`}
                >
                  <div className="flex min-w-max gap-2">
                    {days.map((day) => {
                      const isOut = isBooked(selectedKayak.id, day.iso);
                      const isSelected = isSelectedForCheckout(
                        selectedKayak.id,
                        day.iso
                      );
                      return (
                        <button
                          key={day.iso}
                          type="button"
                          disabled={isOut}
                          onClick={() =>
                            toggleCheckoutSelection(selectedKayak, day.iso)
                          }
                          className={`min-h-20 w-24 shrink-0 rounded-xl border px-3 py-2 text-left text-sm transition ${
                            isOut
                              ? "cursor-not-allowed border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-ink-muted)] opacity-60"
                              : isSelected
                                ? "cursor-pointer border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                              : "cursor-pointer border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-400 hover:bg-emerald-100"
                          }`}
                        >
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-current">
                            {formatMonthLabel(day.iso)}
                          </span>
                          <span className="mt-1 block text-2xl font-semibold leading-none">
                            {day.day}
                          </span>
                          <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.12em]">
                            {day.dow}
                          </span>
                          <span className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.12em]">
                            {isOut ? "Out" : isSelected ? "Selected" : "Open"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="space-y-3">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => scrollByPage(gridScrollRef, -1)}
            className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Earlier
          </button>
          <button
            type="button"
            onClick={() => scrollByPage(gridScrollRef, 1)}
            className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Later
          </button>
        </div>
        <div
          ref={gridScrollRef}
          className="max-w-full overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white"
        >
        <table className="min-w-max text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-56 bg-[var(--color-bg)] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                Rental
              </th>
              {days.map((d) => (
                <th
                  key={d.iso}
                  className="min-w-20 bg-[var(--color-bg)] px-3 py-3 text-center"
                >
                  <div className="text-[10px] font-semibold tracking-wider text-[var(--color-ink-muted)]">
                    {d.dow}
                  </div>
                  <div className="mt-0.5 text-base font-semibold leading-none">
                    {d.day}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kayaks.map((k) => {
              const bookedSet = new Set(bookedByKayak[k.id] ?? []);
              const isSelected = selectedKayak?.id === k.id;
              return (
                <tr
                  key={k.id}
                  onClick={() => setSelectedKayakId(k.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedKayakId(k.id);
                    }
                  }}
                  tabIndex={0}
                  title={`View ${k.name} dates`}
                  className={`group cursor-pointer border-t border-[var(--color-border)] transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-accent)]/30 ${
                    isSelected
                      ? "bg-[var(--color-bg)]"
                      : "hover:bg-[var(--color-bg)]"
                  }`}
                >
                  <td
                    className={`sticky left-0 min-w-56 px-4 py-3 transition ${
                      isSelected
                        ? "bg-[var(--color-bg)]"
                        : "bg-white group-hover:bg-[var(--color-bg)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative aspect-square h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[var(--color-bg)]">
                        {k.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={k.image_url}
                            alt={k.name}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <KayakIllustration
                              color={k.color}
                              capacity={k.capacity}
                              className="h-3/5 w-auto"
                            />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{k.name}</div>
                        <div className="mt-0.5 truncate text-xs text-[var(--color-ink-muted)]">
                          {describeKayak(k)}
                        </div>
                      </div>
                    </div>
                  </td>
                  {days.map((d) => {
                    const out = bookedSet.has(d.iso);
                    const selected = isSelectedForCheckout(k.id, d.iso);
                    if (out) {
                      return (
                        <td key={d.iso} className="min-w-20 px-3 py-3 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-800">
                            Out
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={d.iso} className="min-w-20 px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleCheckoutSelection(k, d.iso);
                          }}
                          className={`inline-flex cursor-pointer items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
                            selected
                              ? "bg-[var(--color-accent)] text-white"
                              : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                          }`}
                        >
                          {selected ? "Selected" : "Open"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <div className="sticky bottom-4 z-20 rounded-2xl border border-[var(--color-border)] bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              Selected rentals
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--color-ink)]">
              {checkoutSelection && selectedCheckoutKayaks.length > 0
                ? `${selectedCheckoutKayaks.length} ${
                    selectedCheckoutKayaks.length === 1 ? "kayak" : "kayaks"
                  } on ${checkoutSelection.dateIso} · ${formatMoney(checkoutTotal)}`
                : "Choose one or more open kayaks on the same day"}
            </p>
          </div>
          <button
            type="button"
            disabled={!checkoutSelection || selectedCheckoutKayaks.length === 0}
            onClick={openSelectedCheckout}
            className="inline-flex cursor-pointer items-center justify-center rounded-full bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reserve selected
          </button>
        </div>
      </div>

      <BookingModal
        kayaks={active?.kayaks ?? []}
        dateIso={active?.dateIso ?? null}
        open={active !== null}
        onClose={() => setActive(null)}
      />
    </>
  );
}
