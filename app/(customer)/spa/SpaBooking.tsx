"use client";

import { useEffect, useMemo, useState } from "react";
import {
  readGuestBookingSession,
  saveGuestBookingSession,
} from "@/components/customer/bookingSession";
import { formatMoney, type MassageService } from "@/lib/types";

type Slot = { iso: string; label: string };

function clean(value: unknown) {
  return String(value || "").trim();
}

function todayLocalIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function dateLabel(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function SpaBooking({
  services,
  available,
  initialReservation = "",
  initialLastName = "",
}: {
  services: MassageService[];
  available: boolean;
  initialReservation?: string;
  initialLastName?: string;
}) {
  const [reservation, setReservation] = useState(initialReservation);
  const [lastName, setLastName] = useState(initialLastName);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [dateIso, setDateIso] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);

  const service = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId]
  );

  useEffect(() => {
    const saved = readGuestBookingSession();
    if (!saved) return;
    if (!initialReservation) setReservation(saved.reservation);
    if (!initialLastName && saved.lastName) setLastName(saved.lastName);
  }, [initialReservation, initialLastName]);

  // Any change to the inputs invalidates the previously loaded slots.
  useEffect(() => {
    setSlots([]);
    setSelectedSlot("");
    setSlotsLoaded(false);
    setSlotsError("");
  }, [serviceId, dateIso, reservation, lastName]);

  const canSearch =
    Boolean(clean(reservation) && clean(lastName) && serviceId && dateIso);

  async function findTimes() {
    if (!canSearch || loadingSlots) return;
    saveGuestBookingSession({
      reservation: clean(reservation),
      lastName: clean(lastName),
    });
    setLoadingSlots(true);
    setSlotsError("");
    setSlots([]);
    setSelectedSlot("");
    try {
      const res = await fetch("/api/spa/availability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reservationId: clean(reservation),
          lastName: clean(lastName),
          serviceId,
          dateIso,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load times.");
      setSlots(Array.isArray(json.slots) ? json.slots : []);
      setSlotsLoaded(true);
    } catch (err) {
      setSlotsError(err instanceof Error ? err.message : "Could not load times.");
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleCheckout() {
    if (!selectedSlot || !serviceId || checkingOut) return;
    setCheckingOut(true);
    setCheckoutError("");
    try {
      const res = await fetch("/api/spa/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reservationId: clean(reservation),
          lastName: clean(lastName),
          serviceId,
          slotIso: selectedSlot,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Checkout failed.");
      if (typeof json.checkoutUrl === "string" && json.checkoutUrl) {
        window.location.assign(json.checkoutUrl);
        return;
      }
      throw new Error("Checkout did not return a redirect URL.");
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout failed.");
      setCheckingOut(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-[var(--color-accent)]";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white shadow-sm">
        <div
          className="min-h-[220px] bg-cover bg-center"
          style={{ backgroundImage: "url(/landing.jpg)" }}
        >
          <div className="flex min-h-[220px] flex-col justify-end bg-black/35 p-6 text-white md:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/85">
              Elevate Your Stay
            </p>
            <h1 className="mt-2 max-w-3xl font-serif text-4xl font-medium leading-[1.02] tracking-tight md:text-5xl">
              In-Cabin Massage
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/90">
              A licensed therapist comes to your cabin. Choose a service and an
              available time, and pay securely. You&apos;re charged now; if the
              therapist can&apos;t make your time, you&apos;re refunded
              automatically.
            </p>
          </div>
        </div>
      </section>

      {!available || services.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-ink-muted)]">
          In-cabin massage isn&apos;t available right now. Please check back soon.
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <div className="rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
              <h2 className="font-serif text-2xl font-medium tracking-tight">
                Choose a service
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {services.map((svc) => {
                  const selected = svc.id === serviceId;
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => setServiceId(svc.id)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selected
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5 ring-1 ring-[var(--color-accent)]"
                          : "border-[var(--color-border)] bg-white hover:border-[var(--color-accent)]"
                      }`}
                    >
                      <p className="font-serif text-lg font-medium tracking-tight">
                        {svc.name}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                        {svc.duration_min} minutes
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--color-accent-strong)]">
                        {formatMoney(svc.price_cents)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
              <h2 className="font-serif text-2xl font-medium tracking-tight">
                Pick a time
              </h2>
              <label className="mt-4 block space-y-1">
                <span className="text-xs font-medium text-[var(--color-ink-muted)]">
                  Date
                </span>
                <input
                  type="date"
                  value={dateIso}
                  min={todayLocalIso()}
                  onChange={(e) => setDateIso(e.target.value)}
                  className={inputClass}
                />
              </label>

              <button
                type="button"
                onClick={findTimes}
                disabled={!canSearch || loadingSlots}
                className="mt-4 w-full rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingSlots ? "Checking availability…" : "Find available times"}
              </button>

              {!canSearch ? (
                <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
                  Enter your reservation details, choose a service, and pick a
                  date to see open times.
                </p>
              ) : null}

              {slotsError ? (
                <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {slotsError}
                </p>
              ) : null}

              {slotsLoaded && !slotsError ? (
                slots.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-[var(--color-ink-muted)]">
                      {dateLabel(dateIso)} — {slots.length} time
                      {slots.length === 1 ? "" : "s"} available
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((slot) => {
                        const selected = slot.iso === selectedSlot;
                        return (
                          <button
                            key={slot.iso}
                            type="button"
                            onClick={() => setSelectedSlot(slot.iso)}
                            className={`rounded-xl border px-2 py-2 text-sm font-medium transition ${
                              selected
                                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                                : "border-[var(--color-border)] bg-white hover:border-[var(--color-accent)]"
                            }`}
                          >
                            {slot.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl bg-[var(--color-bg)] p-3 text-sm text-[var(--color-ink-muted)]">
                    No open times on {dateLabel(dateIso)}. Try another date.
                  </p>
                )
              ) : null}
            </div>
          </div>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
              <h2 className="font-serif text-2xl font-medium tracking-tight">
                Your details
              </h2>
              <div className="mt-4 grid gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[var(--color-ink-muted)]">
                    Reservation Number
                  </span>
                  <input
                    type="text"
                    value={reservation}
                    onChange={(e) => setReservation(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-[var(--color-ink-muted)]">
                    Last Name
                  </span>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="mt-5 space-y-2 border-t border-[var(--color-border)] pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--color-ink-muted)]">Service</span>
                  <span className="font-medium">{service?.name ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-ink-muted)]">When</span>
                  <span className="font-medium">
                    {selectedSlot
                      ? `${dateLabel(dateIso)}, ${
                          slots.find((s) => s.iso === selectedSlot)?.label ?? ""
                        }`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[var(--color-ink-muted)]">Total</span>
                  <span className="text-xl font-semibold">
                    {service ? formatMoney(service.price_cents) : "—"}
                  </span>
                </div>
              </div>

              {checkoutError ? (
                <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {checkoutError}
                </p>
              ) : null}

              <button
                type="button"
                onClick={handleCheckout}
                disabled={!selectedSlot || checkingOut}
                className="mt-5 w-full rounded-full bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {checkingOut ? "Opening checkout…" : "Book & Pay with Stripe"}
              </button>
            </section>
          </aside>
        </section>
      )}
    </div>
  );
}
