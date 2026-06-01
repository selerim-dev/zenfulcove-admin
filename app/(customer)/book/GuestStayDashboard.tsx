"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { saveGuestBookingSession } from "@/components/customer/bookingSession";

type MyStayContentSection = {
  enabled?: boolean;
  id?: string;
  eyebrow?: string;
  title?: string;
  body?: string;
  linkLabel?: string;
  linkUrl?: string;
};

type StayResponse = {
  ok?: boolean;
  error?: string;
  booking?: {
    id: string;
    status: string;
    guestName: string;
    guestFirstName: string;
    propertyId?: string;
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
    amenitiesText: string;
    goodToKnowText: string;
    additionalRulesText: string;
    goodToKnowItems?: {
      label?: string;
      title?: string;
      text?: string;
    }[];
    reservationFormUrl: string;
    myStaySections?: Record<string, MyStayContentSection>;
  };
  access?: {
    code: string;
    released: boolean;
    formSubmitted: boolean;
    eligible?: boolean;
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

function cleanText(value?: unknown) {
  return String(value || "").trim();
}

function visibleMyStaySections(
  sections?: Record<string, MyStayContentSection>
) {
  const configured = sections || {};
  return Object.entries(DEFAULT_MY_STAY_SECTIONS)
    .map(([key, defaultSection]) => ({
      key,
      ...defaultSection,
      ...(configured[key] || {}),
    }))
    .filter(
      (section) =>
        section.enabled !== false &&
        (cleanText(section.title) ||
          cleanText(section.body) ||
          cleanText(section.linkUrl))
    );
}

const URL_PATTERN = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
const DEFAULT_HEADER_IMAGE = "/landing.jpg";
const DEFAULT_MY_STAY_SECTIONS: Record<string, MyStayContentSection> = {
  thingsToDoInElgin: {
    enabled: true,
    id: "things-to-do-in-elgin",
    eyebrow: "Local Guide",
    title: "Things To Do In Elgin",
    body: "Explore Elgin dining, shopping, parks, events, arts, and history during your stay.",
    linkLabel: "Visit Guide",
    linkUrl: "https://www.elgintexas.gov/1251/Visit-Elgin",
  },
  elginSpotlight: {
    enabled: true,
    id: "elgin-spotlight",
    eyebrow: "Around Town",
    title: "Elgin Spotlight",
    body: "Start with historic downtown for local food, shops, art, and small-town stops close to Zenfulcove.",
    linkLabel: "Explore",
    linkUrl: "https://www.elgintexas.gov/196/Explore-Elgin",
  },
};
const STAY_HEADER_IMAGES = [
  {
    imageUrl: "/stays/fairy.jpg",
    propertyIds: ["608952"],
    names: ["fairy house", "fairy"],
  },
  {
    imageUrl: "/stays/desert.jpg",
    propertyIds: ["608953"],
    names: ["desert rose", "desert"],
  },
  {
    imageUrl: "/stays/sky.jpg",
    propertyIds: ["608954"],
    names: ["sky castle", "sky"],
  },
  {
    imageUrl: "/stays/bird.jpg",
    propertyIds: ["608955"],
    names: ["bird house", "bird"],
  },
  {
    imageUrl: "/stays/doodle.jpg",
    propertyIds: ["754651"],
    names: ["doodle house", "doodle"],
  },
];

function normalizeStayLookup(value?: unknown) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function headerImageForStay({
  propertyId,
  propertyName,
  propertyDisplayName,
}: {
  propertyId?: string;
  propertyName?: string;
  propertyDisplayName?: string;
}) {
  const normalizedId = cleanText(propertyId);
  const nameKeys = [propertyDisplayName, propertyName].map(normalizeStayLookup);

  const match = STAY_HEADER_IMAGES.find((item) => {
    if (normalizedId && item.propertyIds.includes(normalizedId)) return true;
    const itemNames = item.names.map(normalizeStayLookup);
    return nameKeys.some(
      (key) =>
        key &&
        itemNames.some(
          (name) => key === name || key.includes(name) || name.includes(key)
        )
    );
  });

  return match?.imageUrl || DEFAULT_HEADER_IMAGE;
}

function splitUrlTrailingPunctuation(url: string) {
  const match = url.match(/[),.!?:;]+$/);
  if (!match) return { hrefText: url, trailing: "" };
  const trailing = match[0];
  return {
    hrefText: url.slice(0, -trailing.length),
    trailing,
  };
}

function hrefForUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function LinkifiedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    const index = match.index ?? 0;
    const { hrefText, trailing } = splitUrlTrailingPunctuation(rawUrl);

    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    if (hrefText) {
      parts.push(
        <a
          key={`${hrefText}-${index}`}
          href={hrefForUrl(hrefText)}
          target="_blank"
          rel="noreferrer"
          className="break-all text-[var(--color-accent)] underline underline-offset-2 transition hover:text-[var(--color-accent-strong)]"
        >
          {hrefText}
        </a>
      );
    }

    if (trailing) parts.push(trailing);
    lastIndex = index + rawUrl.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts.length > 0 ? parts : text}</>;
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

function SectionCard({
  id,
  eyebrow,
  title,
  action,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article
      id={id}
      className="scroll-mt-24 rounded-[24px] border border-[var(--color-border)] bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-accent)] hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            {eyebrow}
          </p>
          <h2 className="mt-1 font-serif text-2xl font-medium tracking-tight text-[var(--color-ink)]">
            {title}
          </h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function DetailList({
  items,
}: {
  items: { label: string; value: string; mono?: boolean }[];
}) {
  return (
    <dl className="space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            {item.label}
          </dt>
          <dd
            className={`mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-[var(--color-ink)] ${
              item.mono ? "font-mono text-base" : ""
            }`}
          >
            <LinkifiedText text={item.value} />
          </dd>
        </div>
      ))}
    </dl>
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
  lastName?: string;
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
      body: JSON.stringify({ reservationId: reservation, lastName: lastName || "" }),
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
  const headerImageUrl = headerImageForStay({
    propertyId: booking.propertyId,
    propertyName: booking.propertyName,
    propertyDisplayName: stay.propertyDisplayName,
  });
  const formComplete = Boolean(access?.formSubmitted);
  const accessBlocked = access?.eligible === false;
  const mapsAddress = cleanText(stay.googleMapsAddress || stay.address);
  const mapsUrl =
    stay.googleMapsUrl ||
    (mapsAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsAddress)}`
      : "");
  const locationItems = [
    { label: "Address", value: mapsAddress },
    { label: "Arrival notes", value: cleanText(stay.unitDirections) },
    { label: "Parking", value: cleanText(stay.parkingInstructions) },
  ].filter((item) => item.value);
  const wifiItems = [
    { label: "Network", value: cleanText(stay.wifiName), mono: true },
    { label: "Password", value: cleanText(stay.wifiPassword), mono: true },
  ].filter((item) => item.value);
  const goodToKnowText = cleanText(stay.goodToKnowText || stay.additionalRulesText);
  const amenitiesText = cleanText(stay.amenitiesText);
  const myStaySections = visibleMyStaySections(stay.myStaySections);
  const hasPropertyInfo =
    locationItems.length > 0 ||
    Boolean(mapsUrl) ||
    wifiItems.length > 0 ||
    Boolean(goodToKnowText) ||
    Boolean(amenitiesText);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-white shadow-sm">
        <div
          className="min-h-[320px] bg-cover bg-center"
          style={{ backgroundImage: `url("${headerImageUrl}")` }}
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
          value={
            access?.released && access.code
              ? access.code
              : accessBlocked
                ? "Blocked"
                : "Pending"
          }
          helper={access?.message}
        />
      </section>

      <StayCard
        className={
          formComplete
            ? "border-emerald-200 bg-emerald-50/20"
            : "border-red-200 bg-red-50/30"
        }
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-medium tracking-tight">
              Reservation form
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
              {formComplete
                ? "Your reservation form is complete."
                : "Complete the reservation form so access-code release can be approved."}
            </p>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
              formComplete
                ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                : "bg-red-50 text-red-700 ring-1 ring-red-200"
            }`}
          >
            <span aria-hidden="true">{formComplete ? "✓" : "!"}</span>
            {formComplete ? "Complete" : "Action required"}
          </span>
        </div>
        {stay.reservationFormUrl ? (
          <Link
            href={stay.reservationFormUrl}
            className={`mt-5 inline-flex rounded-full px-4 py-2 text-sm font-medium transition ${
              formComplete
                ? "border border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300"
                : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            {formComplete ? "View Form" : "Complete Form"}
          </Link>
        ) : null}
      </StayCard>

      {hasPropertyInfo ? (
        <section className="grid gap-4 md:grid-cols-2">
          {locationItems.length > 0 || mapsUrl ? (
            <SectionCard
              eyebrow="Location"
              title="Getting here"
              action={
                mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  >
                    Maps
                  </a>
                ) : null
              }
            >
              <DetailList items={locationItems} />
            </SectionCard>
          ) : null}

          {wifiItems.length > 0 ? (
            <SectionCard eyebrow="Wi-Fi" title="Network details">
              <DetailList items={wifiItems} />
            </SectionCard>
          ) : null}

          {goodToKnowText ? (
            <SectionCard eyebrow="Details" title="Good to Know">
              <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-ink)]">
                <LinkifiedText text={goodToKnowText} />
              </p>
            </SectionCard>
          ) : null}

          {amenitiesText ? (
            <SectionCard eyebrow="Amenities" title="What is included">
              <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--color-ink)]">
                <LinkifiedText text={amenitiesText} />
              </p>
            </SectionCard>
          ) : null}
        </section>
      ) : null}

      {myStaySections.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2">
          {myStaySections.map((section) => {
            const body = cleanText(section.body);
            const linkUrl = cleanText(section.linkUrl);
            const linkLabel = cleanText(section.linkLabel) || "Explore";
            return (
              <SectionCard
                key={section.key}
                id={section.id}
                eyebrow={cleanText(section.eyebrow) || "Local Guide"}
                title={cleanText(section.title) || "Local Guide"}
                action={
                  linkUrl ? (
                    <a
                      href={hrefForUrl(linkUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                    >
                      {linkLabel}
                    </a>
                  ) : null
                }
              >
                {body ? (
                  <p className="text-sm leading-relaxed text-[var(--color-ink)]">
                    <LinkifiedText text={body} />
                  </p>
                ) : null}
              </SectionCard>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
