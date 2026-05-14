"use client";

import { useCallback, useState } from "react";
import Modal from "./Modal";
import KayakIllustration from "./KayakIllustration";
import BookingForm, {
  type Validation,
} from "@/app/(customer)/book/[kayakId]/BookingForm";
import BookingConfirmation from "./BookingConfirmation";
import { formatMoney, type BookingSuccess, type Kayak } from "@/lib/types";
import { formatLongDate } from "@/lib/dates";

function firstNameOf(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

export default function BookingModal({
  kayak,
  dateIso,
  open,
  onClose,
  initialReservation,
  initialLastName,
}: {
  kayak: Kayak | null;
  dateIso: string | null;
  open: boolean;
  onClose: () => void;
  initialReservation?: string;
  initialLastName?: string;
}) {
  const [success, setSuccess] = useState<BookingSuccess | null>(null);
  const [validation, setValidation] = useState<Validation>({ status: "idle" });

  const handleValidation = useCallback((value: Validation) => {
    setValidation(value);
  }, []);

  function handleClose() {
    setSuccess(null);
    setValidation({ status: "idle" });
    onClose();
  }

  const isFree = validation.status === "ok" && validation.isFree;
  const greetingName =
    validation.status === "ok" ? firstNameOf(validation.guestName) : "";
  const heading = greetingName
    ? `Almost there, ${greetingName}.`
    : "Almost there.";

  return (
    <Modal open={open} onClose={handleClose} title="">
      {kayak &&
        dateIso &&
        (success ? (
          <BookingConfirmation booking={success} onDone={handleClose} />
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink)]">
                {formatLongDate(dateIso)}
              </p>
              <h2 className="mt-2 font-serif text-3xl font-medium leading-[1.05] tracking-tight md:text-4xl">
                {heading}
              </h2>
            </div>
            <header className="flex items-center gap-4 rounded-2xl bg-[var(--color-bg)] p-4">
              <div className="relative aspect-square h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--color-surface)]">
                {kayak.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={kayak.image_url}
                    alt={kayak.name}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <KayakIllustration
                      color={kayak.color}
                      capacity={kayak.capacity}
                      className="h-3/5 w-auto"
                    />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-serif text-lg font-medium tracking-tight">
                  {kayak.name}
                </p>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  {kayak.capacity === 1 ? "Solo" : `${kayak.capacity}-seat`}
                  {kayak.length_feet ? ` · ${kayak.length_feet} ft` : ""}
                </p>
              </div>
              <div className="text-right">
                {isFree ? (
                  <>
                    <p className="text-xs font-medium text-[var(--color-ink-muted)] line-through">
                      {formatMoney(kayak.daily_rate_cents)}/day
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-[var(--color-accent-strong)]">
                      Free
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-medium text-[var(--color-accent-strong)]">
                    {formatMoney(kayak.daily_rate_cents)}/day
                  </p>
                )}
              </div>
            </header>
            <BookingForm
              kayak={kayak}
              dateIso={dateIso}
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
