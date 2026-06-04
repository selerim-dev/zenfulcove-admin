"use client";

import { useCallback, useMemo, useState } from "react";
import Modal from "./Modal";
import KayakIllustration from "./KayakIllustration";
import BookingForm, {
  type Validation,
} from "@/app/(customer)/book/[kayakId]/BookingForm";
import BookingConfirmation from "./BookingConfirmation";
import { formatMoney, type BookingSuccess, type Kayak } from "@/lib/types";
import { formatLongDate, inclusiveDays } from "@/lib/dates";

function firstNameOf(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

export default function BookingModal({
  kayak,
  kayaks,
  dateIso,
  startIso,
  endIso,
  open,
  onClose,
  initialReservation,
  initialLastName,
}: {
  kayak?: Kayak | null;
  kayaks?: Kayak[] | null;
  dateIso?: string | null;
  startIso?: string | null;
  endIso?: string | null;
  open: boolean;
  onClose: () => void;
  initialReservation?: string;
  initialLastName?: string;
}) {
  const [success, setSuccess] = useState<BookingSuccess | null>(null);
  const [validation, setValidation] = useState<Validation>({ status: "idle" });
  const selectedKayaks = useMemo(
    () => (kayaks && kayaks.length > 0 ? kayaks : kayak ? [kayak] : []),
    [kayak, kayaks]
  );
  const startDateIso = startIso || dateIso;
  const endDateIso = endIso || startDateIso;
  const rentalDays =
    startDateIso && endDateIso ? inclusiveDays(startDateIso, endDateIso) : 0;
  const total =
    selectedKayaks.reduce(
      (sum, item) => sum + Number(item.daily_rate_cents || 0),
      0
    ) * rentalDays;
  const dateLabel =
    startDateIso && endDateIso && startDateIso !== endDateIso
      ? `${formatLongDate(startDateIso)} - ${formatLongDate(endDateIso)}`
      : startDateIso
        ? formatLongDate(startDateIso)
        : "";

  const handleValidation = useCallback((value: Validation) => {
    setValidation(value);
  }, []);

  function handleClose() {
    setSuccess(null);
    setValidation({ status: "idle" });
    onClose();
  }

  const greetingName =
    validation.status === "ok" ? firstNameOf(validation.guestName) : "";
  const heading = greetingName
    ? `Almost there, ${greetingName}.`
    : "Almost there.";

  return (
    <Modal open={open} onClose={handleClose} title="">
      {selectedKayaks.length > 0 &&
        startDateIso &&
        endDateIso &&
        (success ? (
          <BookingConfirmation booking={success} onDone={handleClose} />
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink)]">
                {dateLabel}
              </p>
              <h2 className="mt-2 font-serif text-3xl font-medium leading-[1.05] tracking-tight md:text-4xl">
                {heading}
              </h2>
            </div>
            <header className="rounded-2xl bg-[var(--color-bg)] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-serif text-lg font-medium tracking-tight">
                    {selectedKayaks.length === 1
                      ? selectedKayaks[0].name
                      : `${selectedKayaks.length} kayak rentals`}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    Paid rental fleet checkout
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium text-[var(--color-accent-strong)]">
                  {formatMoney(total)}/day
                </p>
              </div>
              <div className="mt-4 space-y-3">
                {selectedKayaks.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="relative aspect-square h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[var(--color-surface)]">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <KayakIllustration
                            color={item.color}
                            capacity={item.capacity}
                            className="h-3/5 w-auto"
                          />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {item.capacity === 1
                          ? "Solo"
                          : `${item.capacity}-seat`}
                        {item.length_feet ? ` · ${item.length_feet} ft` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs font-medium text-[var(--color-accent-strong)]">
                      {formatMoney(item.daily_rate_cents)}
                    </p>
                  </div>
                ))}
              </div>
            </header>
            <BookingForm
              kayaks={selectedKayaks}
              dateIso={startDateIso}
              endDateIso={endDateIso}
              onSuccess={setSuccess}
              onValidationChange={handleValidation}
              initialReservation={initialReservation}
              initialLastName={initialLastName}
            />
          </div>
        ))}
    </Modal>
  );
}
