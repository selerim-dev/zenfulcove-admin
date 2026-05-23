"use client";

import { useState } from "react";
import BookingModal from "@/components/customer/BookingModal";
import KayakIllustration from "@/components/customer/KayakIllustration";
import { type Kayak } from "@/lib/types";

type Day = { iso: string; dow: string; day: number };

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
    kayak: Kayak;
    dateIso: string;
  } | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--color-bg)] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                Rental
              </th>
              {days.map((d) => (
                <th
                  key={d.iso}
                  className="bg-[var(--color-bg)] px-3 py-3 text-center"
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
              return (
                <tr
                  key={k.id}
                  className="border-t border-[var(--color-border)]"
                >
                  <td className="sticky left-0 bg-white px-4 py-3">
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
                      </div>
                    </div>
                  </td>
                  {days.map((d) => {
                    const out = bookedSet.has(d.iso);
                    if (out) {
                      return (
                        <td key={d.iso} className="px-3 py-3 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-800">
                            Out
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={d.iso} className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setActive({ kayak: k, dateIso: d.iso })
                          }
                          className="inline-flex cursor-pointer items-center justify-center rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 transition hover:bg-emerald-200"
                        >
                          Open
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

      <BookingModal
        kayak={active?.kayak ?? null}
        dateIso={active?.dateIso ?? null}
        open={active !== null}
        onClose={() => setActive(null)}
      />
    </>
  );
}
