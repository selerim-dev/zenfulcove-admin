"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, type BookingSuccess, type Kayak } from "@/lib/types";
import { inclusiveDays } from "@/lib/dates";

type FieldName = "reservation" | "lastName" | "waiver";

const noErrors: Record<FieldName, boolean> = {
  reservation: false,
  lastName: false,
  waiver: false,
};

export type Validation =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ok";
      isFree: boolean;
      cabin: string;
      guestName: string | null;
    }
  | { status: "error"; error: string };

function shake(el: HTMLElement | null) {
  if (!el) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-8px)" },
      { transform: "translateX(8px)" },
      { transform: "translateX(-6px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(-3px)" },
      { transform: "translateX(3px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 420, easing: "ease-out" }
  );
}

const labelClass =
  "block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]";

export default function BookingForm({
  kayak,
  kayaks,
  dateIso,
  endDateIso,
  onSuccess,
  onValidationChange,
  initialReservation = "",
  initialLastName = "",
}: {
  kayak?: Kayak;
  kayaks?: Kayak[];
  dateIso: string;
  endDateIso?: string;
  onSuccess?: (result: BookingSuccess) => void;
  onValidationChange?: (validation: Validation) => void;
  initialReservation?: string;
  initialLastName?: string;
}) {
  const router = useRouter();
  const startDateIso = dateIso;
  const lastDateIso = endDateIso || dateIso;
  const days = inclusiveDays(startDateIso, lastDateIso);
  const selectedKayaks = useMemo(
    () => (kayaks && kayaks.length > 0 ? kayaks : kayak ? [kayak] : []),
    [kayak, kayaks]
  );
  const totalAmount =
    selectedKayaks.reduce(
      (sum, item) => sum + Number(item.daily_rate_cents || 0),
      0
    ) * days;
  const [reservation, setReservation] = useState(initialReservation);
  const [lastName, setLastName] = useState(initialLastName);
  const [waiver, setWaiver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] =
    useState<Record<FieldName, boolean>>(noErrors);
  const [validation, setValidation] = useState<Validation>({ status: "idle" });

  const reservationRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const waiverRef = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    onValidationChange?.(validation);
  }, [validation, onValidationChange]);

  // Debounced reservation lookup whenever both fields are filled.
  useEffect(() => {
    const r = reservation.trim();
    const l = lastName.trim();
    if (!r || !l) {
      setValidation({ status: "idle" });
      return;
    }
    setValidation({ status: "loading" });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/bookings/validate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reservationId: r,
            lastName: l,
            dateIso: startDateIso,
            startDateIso,
            endDateIso: lastDateIso,
          }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) {
          setValidation({
            status: "error",
            error: json.error ?? "Validation failed",
          });
        } else {
          setValidation({
            status: "ok",
            isFree: false,
            cabin: typeof json.cabin === "string" ? json.cabin : "",
            guestName: json.guestName ?? null,
          });
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setValidation({ status: "error", error: "Network error" });
      }
    }, 500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [reservation, lastName, startDateIso, lastDateIso]);

  const lookupReady =
    selectedKayaks.length > 0 &&
    reservation.trim().length > 0 &&
    lastName.trim().length > 0 &&
    validation.status === "ok";

  function clearFieldError(field: FieldName) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: false } : prev));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !lookupReady) return;

    const next: Record<FieldName, boolean> = { ...noErrors };
    if (reservation.trim().length === 0) next.reservation = true;
    if (lastName.trim().length === 0) next.lastName = true;
    if (!waiver) next.waiver = true;

    const anyError = Object.values(next).some(Boolean);
    setErrors(next);

    if (anyError) {
      if (next.reservation) shake(reservationRef.current);
      if (next.lastName) shake(lastNameRef.current);
      if (next.waiver) shake(waiverRef.current);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kayakId: selectedKayaks[0]?.id,
          kayakIds: selectedKayaks.map((item) => item.id),
          dateIso: startDateIso,
          startDateIso,
          endDateIso: lastDateIso,
          reservationId: reservation.trim(),
          lastName: lastName.trim(),
          waiverAccepted: waiver,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Booking failed");

      if (typeof json.checkoutUrl === "string" && json.checkoutUrl) {
        window.location.assign(json.checkoutUrl);
        return;
      }

      const result: BookingSuccess = {
        bookingId: json.bookingId,
        bookingIds: Array.isArray(json.bookingIds) ? json.bookingIds : undefined,
        referenceCode: json.referenceCode,
        referenceCodes: Array.isArray(json.referenceCodes)
          ? json.referenceCodes
          : undefined,
        lockboxCode: json.lockboxCode ?? null,
        lockboxCodes: Array.isArray(json.lockboxCodes)
          ? json.lockboxCodes
          : undefined,
        customerName: typeof json.customerName === "string" ? json.customerName : "",
        dateIso: startDateIso,
        endDateIso: lastDateIso,
        days,
        kayak: selectedKayaks[0],
        kayaks: selectedKayaks,
        stayLocation: json.cabin ?? "",
        isComplimentary: false,
        amountCents:
          typeof json.amountCents === "number" ? json.amountCents : totalAmount,
        totalAmountCents:
          typeof json.totalAmountCents === "number"
            ? json.totalAmountCents
            : totalAmount,
      };

      if (onSuccess) {
        onSuccess(result);
        router.refresh();
      } else {
        router.push(`/book/confirmation/${json.bookingId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  const inputBaseClass =
    "w-full rounded-xl border bg-white px-4 py-3 text-sm transition focus:outline-none";
  const inputOk =
    "border-[var(--color-border)] focus:border-[var(--color-accent)]";
  const inputBad = "border-red-500 focus:border-red-500";

  const submitDisabled = submitting || !lookupReady;
  let submitLabel = `Continue to checkout · ${formatMoney(totalAmount)}`;
  if (submitting) submitLabel = "Reserving...";
  else if (validation.status === "loading") submitLabel = "Checking...";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="reservation_id" className={labelClass}>
            Reservation Number
          </label>
          <input
            ref={reservationRef}
            id="reservation_id"
            type="text"
            placeholder="From your confirmation email"
            value={reservation}
            onChange={(e) => {
              setReservation(e.target.value);
              clearFieldError("reservation");
            }}
            className={`${inputBaseClass} ${
              errors.reservation ? inputBad : inputOk
            }`}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="last_name" className={labelClass}>
            Last Name
          </label>
          <input
            ref={lastNameRef}
            id="last_name"
            type="text"
            placeholder="As on your reservation"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              clearFieldError("lastName");
            }}
            className={`${inputBaseClass} ${
              errors.lastName ? inputBad : inputOk
            }`}
          />
        </div>
      </div>

      {validation.status === "error" && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {validation.error}
        </p>
      )}
      {validation.status === "ok" && (
        <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
          Verified · {validation.cabin}
          {validation.guestName ? ` · ${validation.guestName}` : ""}
          {` · ${formatMoney(totalAmount)} due at checkout`}
        </p>
      )}

      <label
        ref={waiverRef}
        className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 transition ${
          errors.waiver
            ? "border-red-500"
            : "border-[var(--color-border)] hover:border-[var(--color-accent)]"
        }`}
      >
        <input
          type="checkbox"
          checked={waiver}
          onChange={(e) => {
            setWaiver(e.target.checked);
            clearFieldError("waiver");
          }}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-[var(--color-border)] accent-[var(--color-accent)]"
        />
        <span className="block flex-1">
          <span className="block text-sm font-medium">
            I agree to the kayak safety waiver
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--color-ink-muted)]">
            Rental includes paddles and life jackets. I agree to wear a life
            jacket at all times, return the kayak by the end of the rental day,
            and accept the cancellation policy and liability waiver.{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-[var(--color-accent)] underline underline-offset-2 hover:text-[var(--color-accent-strong)]"
            >
              View full terms
            </a>
          </span>
        </span>
      </label>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitDisabled}
        className="w-full cursor-pointer rounded-full bg-[var(--color-accent)] py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </form>
  );
}
