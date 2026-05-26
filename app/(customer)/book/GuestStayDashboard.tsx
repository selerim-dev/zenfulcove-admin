"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { saveGuestBookingSession } from "@/components/customer/bookingSession";

type StayResponse = {
  ok?: boolean;
  error?: string;
  booking?: {
    id: string;
    status: string;
    guestName: string;
    guestFirstName: string;
    propertyName: string;
    arrivalIso: string;
    departureIso: string;
  };
  stay?: {
    propertyDisplayName: string;
    address: string;
    googleMapsAddress: string;
    googleMapsUrl: string;
    timezone: string;
    checkinTime: string;
    checkoutTime: string;
    wifiName: string;
    wifiPassword: string;
    unitDirections: string;
    parkingInstructions: string;
    dedicatedKayakText: string;
    additionalKayakText: string;
    lifeJacketText: string;
    amenitiesText: string;
    additionalRulesText: string;
    hostName: string;
    urgentPhone: string;
    reservationFormUrl: string;
  };
  access?: {
    code: string;
    released: boolean;
    formSubmitted: boolean;
    status: string;
    message: string;
  };
};

function formatDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function nightsBetween(arrival?: string, departure?: string) {
  if (!arrival || !departure) return 0;
  const start = new Date(`${arrival}T12:00:00`);
  const end = new Date(`${departure}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function phoneHref(phone?: string) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "tel:+15122737962";
}

function InfoTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-accent)] hover:shadow-lg">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-[var(--color-ink)]">
        {value || "Not available"}
      </p>
      {helper ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function StayCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-accent)] hover:shadow-lg ${className}`}
    >
      {children}
    </div>
  );
}

export default function GuestStayDashboard({
  reservation,
  lastName,
}: {
  reservation: string;
  lastName: string;
}) {
  const [data, setData] = useState<StayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    saveGuestBookingSession({ reservation, lastName });
  }, [reservation, lastName]);

  useEffect(() => {
    let active = true;
    fetch("/api/bookings/stay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reservationId: reservation, lastName }),
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!active) return;
        if (!ok) throw new Error(json.error || "Could not load your stay.");
        setData(json);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load your stay.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reservation, lastName]);

  const nights = useMemo(
    () => nightsBetween(data?.booking?.arrivalIso, data?.booking?.departureIso),
    [data?.booking?.arrivalIso, data?.booking?.departureIso]
  );

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center">
        <p className="text-sm text-[var(--color-ink-muted)]">Loading your stay...</p>
      </div>
    );
  }

  if (error || !data?.booking || !data.stay) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
          Guest Portal
        </p>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">
          We could not open that stay.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          {error || "Check the booking ID and last name from your confirmation."}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-full bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
        >
          Try again
        </Link>
      </div>
    );
  }

  const booking = data.booking;
  const stay = data.stay;
  const access = data.access;
  const mapsAddress = stay.googleMapsAddress || stay.address;
  const mapsUrl =
    stay.googleMapsUrl ||
    (mapsAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsAddress)}`
      : "");

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-white shadow-sm">
        <div
          className="min-h-[320px] bg-cover bg-center"
          style={{ backgroundImage: "url(/landing.jpg)" }}
        >
          <div className="flex min-h-[320px] flex-col justify-end bg-black/35 p-6 text-white md:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/85">
              Zenfulcove Glamping Stay
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-5xl font-medium leading-[1.02] tracking-tight md:text-6xl">
              {stay.propertyDisplayName || booking.propertyName}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/90 md:text-base">
              Welcome, {booking.guestFirstName || booking.guestName}. Your
              reservation details, arrival notes, Wi-Fi, and access status are
              collected here for your stay.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <InfoTile
          label="Check-in"
          value={formatDate(booking.arrivalIso)}
          helper={`After ${stay.checkinTime || "3:00 p.m."}`}
        />
        <InfoTile
          label="Check-out"
          value={formatDate(booking.departureIso)}
          helper={`By ${stay.checkoutTime || "11:00 a.m."}`}
        />
        <InfoTile
          label="Nights"
          value={nights === 1 ? "1 night" : `${nights} nights`}
          helper={`Booking ${booking.id}`}
        />
        <InfoTile
          label="Access"
          value={access?.released && access.code ? access.code : "Pending"}
          helper={access?.message}
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <StayCard>
            <h2 className="font-serif text-2xl font-medium tracking-tight">
              Getting here
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
              {mapsAddress}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <p className="rounded-2xl bg-[var(--color-bg)] p-4 text-sm leading-relaxed text-[var(--color-ink)]">
                {stay.unitDirections}
              </p>
              <p className="rounded-2xl bg-[var(--color-bg)] p-4 text-sm leading-relaxed text-[var(--color-ink)]">
                {stay.parkingInstructions}
              </p>
            </div>
            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                Open in Maps
              </a>
            ) : null}
          </StayCard>

          <div className="grid gap-4 md:grid-cols-2">
            <StayCard>
              <h2 className="font-serif text-2xl font-medium tracking-tight">
                Wi-Fi
              </h2>
              <dl className="mt-4 space-y-3">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                    Network
                  </dt>
                  <dd className="mt-1 break-words font-mono text-lg text-[var(--color-ink)]">
                    {stay.wifiName || "Not available"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                    Password
                  </dt>
                  <dd className="mt-1 break-words font-mono text-lg text-[var(--color-ink)]">
                    {stay.wifiPassword || "Not available"}
                  </dd>
                </div>
              </dl>
            </StayCard>

            <StayCard>
              <h2 className="font-serif text-2xl font-medium tracking-tight">
                Reservation form
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {access?.formSubmitted
                  ? "Your reservation form is complete."
                  : "Complete the reservation form so access-code release can be approved."}
              </p>
              {stay.reservationFormUrl ? (
                <a
                  href={stay.reservationFormUrl}
                  className="mt-5 inline-flex rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
                >
                  Open Reservation Form
                </a>
              ) : null}
            </StayCard>
          </div>

          <StayCard>
            <h2 className="font-serif text-2xl font-medium tracking-tight">
              Good to know
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
              {[stay.amenitiesText, stay.additionalRulesText]
                .filter(Boolean)
                .map((text) => (
                  <p key={text}>{text}</p>
                ))}
            </div>
          </StayCard>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <StayCard>
            <h2 className="font-serif text-2xl font-medium tracking-tight">
              Need help?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
              For urgent matters, contact {stay.hostName || "Zenfulcove Glamping"}.
            </p>
            <a
              href={phoneHref(stay.urgentPhone)}
              className="mt-5 block rounded-2xl bg-[var(--color-ink)] px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
            >
              Call or text {stay.urgentPhone || "512-273-7962"}
            </a>
          </StayCard>

          <StayCard>
            <h2 className="font-serif text-2xl font-medium tracking-tight">
              Kayaks
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
              {stay.dedicatedKayakText ? <p>{stay.dedicatedKayakText}</p> : null}
              {stay.additionalKayakText ? <p>{stay.additionalKayakText}</p> : null}
              {stay.lifeJacketText ? <p>{stay.lifeJacketText}</p> : null}
            </div>
            <p className="mt-4 rounded-2xl bg-[var(--color-bg)] p-3 text-xs leading-relaxed text-[var(--color-ink-muted)]">
              Online kayak checkout is currently paused while payments are
              being finalized. Reply to your guest message thread for rentals.
            </p>
          </StayCard>
        </aside>
      </div>
    </div>
  );
}
