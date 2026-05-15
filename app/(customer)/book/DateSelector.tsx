"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { formatMonthYear } from "@/lib/dates";

type DateOption = {
  iso: string;
  dow: string;
  day: number;
  available: number;
};

export default function DateSelector({
  dates,
  selected,
  reservation,
  lastName,
}: {
  dates: DateOption[];
  selected: string;
  reservation?: string;
  lastName?: string;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedIso =
    dates.find((d) => d.iso === selected)?.iso ?? dates[0]?.iso ?? "";
  const monthLabel = selectedIso ? formatMonthYear(selectedIso) : "";

  function scrollByDays(n: number) {
    const el = scrollRef.current;
    if (!el) return;
    const firstChip = el.querySelector("button");
    const chipWidth = firstChip
      ? firstChip.getBoundingClientRect().width + 8
      : 96;
    el.scrollBy({ left: chipWidth * n, behavior: "smooth" });
  }

  function scrollToToday() {
    scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }

  function dateHref(iso: string) {
    const params = new URLSearchParams({ date: iso });
    if (reservation) params.set("reservation", reservation);
    if (lastName) params.set("lastName", lastName);
    return `/book?${params.toString()}`;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
          {monthLabel}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollByDays(-7)}
            aria-label="Previous week"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-base leading-none text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={scrollToToday}
            className="cursor-pointer rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => scrollByDays(7)}
            aria-label="Next week"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-base leading-none text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            ›
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth"
      >
        {dates.map(({ iso, dow, day, available }) => {
          const isSelected = iso === selected;
          const isFull = available === 0;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => router.push(dateHref(iso), { scroll: false })}
              className={`flex min-w-[88px] shrink-0 cursor-pointer flex-col items-center rounded-2xl border px-4 py-3.5 text-center transition ${
                isSelected
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white shadow-sm"
                  : isFull
                    ? "border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] hover:border-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-white text-[var(--color-ink)] hover:border-[var(--color-accent)]"
              }`}
            >
              <span
                className={`text-[10px] font-semibold tracking-wider ${
                  isSelected ? "opacity-80" : "text-[var(--color-ink-muted)]"
                }`}
              >
                {dow}
              </span>
              <span className="mt-1.5 font-serif text-2xl font-medium leading-none">
                {day}
              </span>
              <span
                className={`mt-2 text-[11px] font-medium ${
                  isSelected
                    ? "opacity-90"
                    : isFull
                      ? "text-red-600"
                      : "text-[var(--color-accent-strong)]"
                }`}
              >
                {isFull ? "Full" : `${available} Open`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
