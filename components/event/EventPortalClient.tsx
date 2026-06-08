"use client";

import { useEffect, useMemo, useState } from "react";
import FloatingSaveBar from "@/components/FloatingSaveBar";

type Role = "facilitator" | "participant";

type ScheduleEntry = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  location: string;
  description: string;
};

type EventProperty = {
  id: string;
  name: string;
  displayName: string;
  address: string;
  googleMapsAddress: string;
  googleMapsUrl: string;
  unitDirections: string;
  parkingInstructions: string;
  wifiName: string;
  wifiPassword: string;
  amenitiesText: string;
  goodToKnowText: string;
  accessCode: string;
  imageUrl: string;
  includedKayak?: {
    itemName: string;
    code: string | null;
    note?: string;
  } | null;
};

type EventKayak = {
  id: string;
  name: string;
  code: string;
  capacity: number;
  lengthFeet: number | null;
  color: string;
  colorLabel: string;
  isActive: boolean;
};

type LocalGuide = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  linkLabel: string;
  linkUrl: string;
};

type WaiverSubmission = {
  id: string;
  name: string;
  email: string;
  phone: string;
  submittedAt: string;
};

type PortalData = {
  role: Role;
  event: {
    id: string;
    name: string;
    status: string;
    startDate: string;
    endDate: string;
    scheduleEntries: ScheduleEntry[];
    notes: string;
    participantCode?: string;
  };
  properties: EventProperty[];
  kayaks: EventKayak[];
  localGuides: LocalGuide[];
  waiver: {
    formSlug: string;
    url: string;
    submittedCount: number;
    databaseAvailable: boolean;
    submissions: WaiverSubmission[];
  };
};

const STORAGE_KEY = "zc_event_portal_code";
const TABS = [
  { id: "properties", label: "Properties" },
  { id: "amenities", label: "Amenities" },
  { id: "schedule", label: "Schedule" },
  { id: "waivers", label: "Waivers" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function clean(value: unknown) {
  return String(value || "").trim();
}

function formatDate(value: string) {
  if (!value) return "Date not set";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateRange(start: string, end: string) {
  if (start && end && start !== end) return `${formatDate(start)} - ${formatDate(end)}`;
  return formatDate(start || end);
}

function formatSubmittedAt(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function datesBetween(start: string, end: string) {
  if (!start && !end) return [];
  const startDate = new Date(`${start || end}T12:00:00`);
  const endDate = new Date(`${end || start}T12:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [start || end].filter(Boolean);
  }

  const dates: string[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate && dates.length < 45) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function makeScheduleId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `schedule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hrefForUrl(value: string) {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function LinkifiedText({ text }: { text: string }) {
  const pattern = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const rawUrl = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push(
      <a
        key={`${rawUrl}-${index}`}
        href={hrefForUrl(rawUrl)}
        target="_blank"
        rel="noreferrer"
        className="break-all text-[var(--color-accent)] underline underline-offset-2 hover:text-[var(--color-accent-strong)]"
      >
        {rawUrl}
      </a>
    );
    lastIndex = index + rawUrl.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts.length > 0 ? parts : text}</>;
}

function PanelCard({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-1 font-serif text-2xl font-medium tracking-tight">
            {title}
          </h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4 min-h-0 flex-1">{children}</div>
    </section>
  );
}

function LoginPanel({
  initialCode,
  onSubmit,
  loading,
  error,
}: {
  initialCode: string;
  onSubmit: (code: string) => void;
  loading: boolean;
  error: string;
}) {
  const [code, setCode] = useState(initialCode);

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--color-ink)]"
      style={{
        backgroundImage: "url(/landing.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "top center",
      }}
    >
      <div className="flex flex-1 items-center justify-center bg-black/45 px-5 py-10">
        <div className="w-full max-w-md rounded-2xl border border-white/25 bg-white/95 p-6 shadow-2xl backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
            Zenfulcove Glamping
          </p>
          <h1 className="mt-2 font-serif text-4xl font-medium tracking-tight">
            Event Portal
          </h1>
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(code);
            }}
          >
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                Event Code
              </span>
              <input
                type="password"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="off"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)] focus:bg-white"
              />
            </label>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)] disabled:opacity-60"
            >
              {loading ? "Opening..." : "Open Event"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function PropertiesTab({ properties }: { properties: EventProperty[] }) {
  const [selectedId, setSelectedId] = useState(properties[0]?.id || "");
  const selected =
    properties.find((property) => property.id === selectedId) || properties[0];

  if (!selected) {
    return (
      <PanelCard title="Property information">
        <p className="text-sm text-[var(--color-ink-muted)]">
          No properties are configured for this event yet.
        </p>
      </PanelCard>
    );
  }

  const mapsUrl =
    selected.googleMapsUrl ||
    (selected.googleMapsAddress || selected.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          selected.googleMapsAddress || selected.address
        )}`
      : "");

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
      <PanelCard title="Properties" className="lg:h-full">
        <div className="max-h-[min(420px,60vh)] space-y-2 overflow-y-auto pr-1 lg:max-h-none">
          {properties.map((property) => {
            const active = property.id === selected.id;
            return (
              <button
                key={property.id}
                type="button"
                onClick={() => setSelectedId(property.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                  active
                    ? "border-[var(--color-accent)] bg-[var(--color-bg)] text-[var(--color-ink)]"
                    : "border-[var(--color-border)] bg-white text-[var(--color-ink-muted)] hover:border-[var(--color-accent)]"
                }`}
              >
                <span className="block font-medium">{property.displayName}</span>
                <span className="mt-0.5 block text-xs">{property.name}</span>
              </button>
            );
          })}
        </div>
      </PanelCard>

      <div className="grid min-h-0 gap-4 md:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm md:col-span-2">
          <div
            className="min-h-[190px] bg-cover bg-center md:min-h-[240px]"
            style={{
              backgroundImage: `url("${selected.imageUrl || "/landing.jpg"}")`,
            }}
          >
            <div className="flex min-h-[190px] flex-col justify-end bg-black/35 p-5 text-white md:min-h-[240px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/85">
                Property
              </p>
              <h2 className="mt-1 font-serif text-4xl font-medium leading-tight tracking-tight">
                {selected.displayName}
              </h2>
              <p className="mt-1 text-sm text-white/85">{selected.name}</p>
            </div>
          </div>
        </section>

        <PanelCard
          title="Access"
          eyebrow={selected.displayName}
          action={
            mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                Maps
              </a>
            ) : null
          }
        >
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                Property Code
              </dt>
              <dd className="mt-1 font-mono text-2xl font-semibold tracking-[0.16em]">
                {selected.accessCode || "Not set"}
              </dd>
            </div>
            {selected.address || selected.googleMapsAddress ? (
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                  Address
                </dt>
                <dd className="mt-1 whitespace-pre-line leading-relaxed">
                  {selected.googleMapsAddress || selected.address}
                </dd>
              </div>
            ) : null}
          </dl>
        </PanelCard>

        <PanelCard title="Wi-Fi">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                Network
              </dt>
              <dd className="mt-1 break-words font-mono text-lg">
                {selected.wifiName || "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                Password
              </dt>
              <dd className="mt-1 break-words font-mono text-lg">
                {selected.wifiPassword || "Not set"}
              </dd>
            </div>
          </dl>
        </PanelCard>

        <PanelCard title="Arrival Notes">
          <div className="max-h-[min(320px,42vh)] overflow-y-auto pr-1 text-sm leading-relaxed">
            {selected.unitDirections ? (
              <p className="whitespace-pre-line">
                <LinkifiedText text={selected.unitDirections} />
              </p>
            ) : (
              <p className="text-[var(--color-ink-muted)]">No arrival notes set.</p>
            )}
            {selected.parkingInstructions ? (
              <p className="mt-4 whitespace-pre-line">
                <LinkifiedText text={selected.parkingInstructions} />
              </p>
            ) : null}
          </div>
        </PanelCard>

        <PanelCard title="Good to Know">
          <div className="max-h-[min(320px,42vh)] overflow-y-auto pr-1 text-sm leading-relaxed">
            {selected.goodToKnowText ? (
              <p className="whitespace-pre-line">
                <LinkifiedText text={selected.goodToKnowText} />
              </p>
            ) : (
              <p className="text-[var(--color-ink-muted)]">No notes set.</p>
            )}
          </div>
        </PanelCard>
      </div>
    </div>
  );
}

function AmenitiesTab({
  properties,
  kayaks,
  localGuides,
}: {
  properties: EventProperty[];
  kayaks: EventKayak[];
  localGuides: LocalGuide[];
}) {
  const propertyKayaks = properties
    .map((property) =>
      property.includedKayak
        ? {
            id: property.id,
            propertyName: property.displayName,
            name: property.includedKayak.itemName,
            code: property.includedKayak.code || "",
            note: property.includedKayak.note || "",
          }
        : null
    )
    .filter(Boolean) as {
    id: string;
    propertyName: string;
    name: string;
    code: string;
    note: string;
  }[];

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <PanelCard title="Included Property Amenities" className="min-h-0 overflow-hidden">
        <div className="max-h-[min(620px,70vh)] space-y-4 overflow-y-auto pr-1">
          {properties.map((property) => (
            <article
              key={property.id}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-serif text-xl font-medium tracking-tight">
                    {property.displayName}
                  </h3>
                  {property.includedKayak ? (
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                      {property.includedKayak.itemName}
                      {property.includedKayak.code
                        ? ` - code ${property.includedKayak.code}`
                        : ""}
                    </p>
                  ) : null}
                </div>
                {property.accessCode ? (
                  <span className="w-fit rounded-full bg-white px-3 py-1 font-mono text-xs font-semibold tracking-[0.14em]">
                    {property.accessCode}
                  </span>
                ) : null}
              </div>
              {property.amenitiesText ? (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
                  <LinkifiedText text={property.amenitiesText} />
                </p>
              ) : (
                <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
                  No amenity notes set for this property.
                </p>
              )}
            </article>
          ))}
        </div>
      </PanelCard>

      <div className="grid min-h-0 gap-4 xl:grid-rows-2">
        <PanelCard title="Kayak Codes" className="min-h-[260px] overflow-hidden">
          <div className="h-full max-h-[min(380px,40vh)] overflow-y-auto pr-1">
            <div className="space-y-4">
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                  Property Kayaks
                </p>
                {propertyKayaks.length > 0 ? (
                  <div className="mt-2 divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
                    {propertyKayaks.map((kayak) => (
                      <div
                        key={kayak.id}
                        className="flex items-start justify-between gap-4 bg-[var(--color-bg)] px-3 py-3 first:rounded-t-xl last:rounded-b-xl"
                      >
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium">
                            {kayak.name}
                          </p>
                          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                            {kayak.propertyName}
                          </p>
                          {kayak.note ? (
                            <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">
                              {kayak.note}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 font-mono text-base font-semibold tracking-[0.14em]">
                          {kayak.code || "N/A"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                    No property kayak codes are configured.
                  </p>
                )}
              </section>

              <section>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                  Rental Fleet
                </p>
                {kayaks.length > 0 ? (
                  <div className="mt-2 divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
                    {kayaks.map((kayak) => (
                      <div
                        key={kayak.id}
                        className="flex items-start justify-between gap-4 bg-white px-3 py-3 first:rounded-t-xl last:rounded-b-xl"
                      >
                        <div className="min-w-0">
                          <p className="break-words text-sm font-medium">{kayak.name}</p>
                          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                            {[
                              kayak.colorLabel,
                              kayak.lengthFeet ? `${kayak.lengthFeet} ft` : "",
                              kayak.capacity
                                ? `${kayak.capacity} ${
                                    kayak.capacity === 1 ? "paddler" : "paddlers"
                                  }`
                                : "",
                              kayak.isActive ? "" : "Hidden from public booking",
                            ]
                              .filter(Boolean)
                              .join(" - ")}
                          </p>
                        </div>
                        <p className="shrink-0 font-mono text-base font-semibold tracking-[0.14em]">
                          {kayak.code || "N/A"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                    No rental fleet kayaks are available from the database.
                  </p>
                )}
              </section>
            </div>
          </div>
        </PanelCard>

        <PanelCard title="Elgin Guide" className="min-h-[260px] overflow-hidden">
          <div className="h-full max-h-[min(380px,40vh)] space-y-3 overflow-y-auto pr-1">
            {localGuides.length > 0 ? (
              localGuides.map((guide) => (
                <article
                  key={guide.key}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                    {guide.eyebrow}
                  </p>
                  <h3 className="mt-1 font-serif text-lg font-medium">
                    {guide.title}
                  </h3>
                  {guide.body ? (
                    <p className="mt-2 text-sm leading-relaxed">
                      <LinkifiedText text={guide.body} />
                    </p>
                  ) : null}
                  {guide.linkUrl ? (
                    <a
                      href={hrefForUrl(guide.linkUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                    >
                      {guide.linkLabel}
                    </a>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="text-sm text-[var(--color-ink-muted)]">
                No local guide cards are configured.
              </p>
            )}
          </div>
        </PanelCard>
      </div>
    </div>
  );
}

function ScheduleTable({
  entries,
  notes,
}: {
  entries: ScheduleEntry[];
  notes: string;
}) {
  const grouped = entries.reduce<Record<string, ScheduleEntry[]>>((acc, entry) => {
    const key = entry.date || "Unscheduled";
    acc[key] = acc[key] || [];
    acc[key].push(entry);
    return acc;
  }, {});

  return (
    <div className="max-h-[min(620px,70vh)] overflow-y-auto pr-1">
      {Object.keys(grouped).length > 0 ? (
        <div className="space-y-5">
          {Object.entries(grouped).map(([date, items]) => (
            <section key={date}>
              <h3 className="font-serif text-xl font-medium tracking-tight">
                {date === "Unscheduled" ? date : formatDate(date)}
              </h3>
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-border)]">
                <table className="w-full min-w-[640px] border-collapse bg-white text-left text-sm">
                  <thead className="bg-[var(--color-bg)] text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Time</th>
                      <th className="px-4 py-3 font-semibold">Activity</th>
                      <th className="px-4 py-3 font-semibold">Location</th>
                      <th className="px-4 py-3 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {items.map((entry) => (
                      <tr key={entry.id}>
                        <td className="whitespace-nowrap px-4 py-3 align-top font-medium">
                          {[entry.startTime, entry.endTime].filter(Boolean).join(" - ") ||
                            "TBD"}
                        </td>
                        <td className="px-4 py-3 align-top font-medium">
                          {entry.title || "Activity"}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {entry.location || "TBD"}
                        </td>
                        <td className="px-4 py-3 align-top text-[var(--color-ink-muted)]">
                          {entry.description || ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-5 text-sm text-[var(--color-ink-muted)]">
          No activities have been added yet.
        </p>
      )}

      {notes ? (
        <section className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            Notes
          </p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
            <LinkifiedText text={notes} />
          </p>
        </section>
      ) : null}
    </div>
  );
}

function ScheduleEditor({
  event,
  saving,
  onSave,
  onCancel,
}: {
  event: PortalData["event"];
  saving: boolean;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const dateOptions = useMemo(() => {
    const range = datesBetween(event.startDate, event.endDate);
    const entryDates = event.scheduleEntries
      .map((entry) => entry.date)
      .filter(Boolean);
    return Array.from(new Set([...range, ...entryDates]));
  }, [event.endDate, event.scheduleEntries, event.startDate]);
  const [entries, setEntries] = useState<ScheduleEntry[]>(event.scheduleEntries);
  const [notes, setNotes] = useState(event.notes || "");
  const dirty =
    JSON.stringify(entries) !== JSON.stringify(event.scheduleEntries) ||
    notes !== (event.notes || "");

  function updateEntry(id: string, patch: Partial<ScheduleEntry>) {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
  }

  function addEntry() {
    setEntries((current) => [
      ...current,
      {
        id: makeScheduleId(),
        date: dateOptions[0] || event.startDate || "",
        startTime: "",
        endTime: "",
        title: "",
        location: "",
        description: "",
      },
    ]);
  }

  async function save() {
    await onSave({ scheduleEntries: entries, notes });
    onCancel();
  }

  return (
    <>
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <PanelCard
        title="Edit Schedule"
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Cancel edits
            </button>
            <button
              type="button"
              onClick={addEntry}
              className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Add Activity
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-strong)] disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Schedule"}
            </button>
          </div>
        }
      >
        <div className="max-h-[min(620px,70vh)] space-y-3 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="grid gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 xl:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.2fr)_minmax(180px,0.7fr)]"
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
                  Day & Time
                </p>
                <div className="mt-1 rounded-xl border border-[var(--color-border)] bg-white p-2">
                  {dateOptions.length > 0 ? (
                    <select
                      aria-label="Activity day"
                      value={entry.date}
                      onChange={(event) =>
                        updateEntry(entry.id, { date: event.target.value })
                      }
                      className="block w-full rounded-lg border-0 bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                    >
                      {dateOptions.map((date) => (
                        <option key={date} value={date}>
                          {formatDate(date)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label="Activity day"
                      type="date"
                      value={entry.date}
                      onChange={(event) =>
                        updateEntry(entry.id, { date: event.target.value })
                      }
                      className="block w-full rounded-lg border-0 bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                    />
                  )}
                  <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <input
                      aria-label="Activity start time"
                      type="time"
                      value={entry.startTime}
                      onChange={(event) =>
                        updateEntry(entry.id, { startTime: event.target.value })
                      }
                      className="block w-full rounded-lg border-0 bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                    />
                    <span className="text-xs font-medium text-[var(--color-ink-muted)]">
                      to
                    </span>
                    <input
                      aria-label="Activity end time"
                      type="time"
                      value={entry.endTime}
                      onChange={(event) =>
                        updateEntry(entry.id, { endTime: event.target.value })
                      }
                      className="block w-full rounded-lg border-0 bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
                  Activity
                  <input
                    type="text"
                    value={entry.title}
                    onChange={(event) =>
                      updateEntry(entry.id, { title: event.target.value })
                    }
                    className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
                  Description
                  <input
                    type="text"
                    value={entry.description}
                    onChange={(event) =>
                      updateEntry(entry.id, { description: event.target.value })
                    }
                    className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
                  Location
                  <input
                    type="text"
                    value={entry.location}
                    onChange={(event) =>
                      updateEntry(entry.id, { location: event.target.value })
                    }
                    className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setEntries((current) =>
                      current.filter((candidate) => candidate.id !== entry.id)
                    )
                  }
                  className="mt-auto w-fit rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          {entries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-5 text-sm text-[var(--color-ink-muted)]">
              No activities have been added yet.
            </p>
          ) : null}
        </div>
      </PanelCard>

      <PanelCard title="Notes">
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={10}
          className="h-56 w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-white xl:h-[520px]"
        />
      </PanelCard>
    </div>
    <FloatingSaveBar
      visible={dirty}
      saving={saving}
      onSave={save}
      disabled={!dirty}
      message="Unsaved schedule changes"
      saveLabel="Save schedule"
      savingLabel="Saving..."
    />
    </>
  );
}

function ScheduleTab({
  data,
  saving,
  onSave,
}: {
  data: PortalData;
  saving: boolean;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (data.role === "facilitator" && editing) {
    return (
      <ScheduleEditor
        key={JSON.stringify([data.event.scheduleEntries, data.event.notes])}
        event={data.event}
        saving={saving}
        onSave={onSave}
        onCancel={() => setEditing(false)}
      />
    );
  }
  return (
    <PanelCard
      title="Event Schedule"
      eyebrow={formatDateRange(data.event.startDate, data.event.endDate)}
      action={
        data.role === "facilitator" ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
          >
            Edit
          </button>
        ) : null
      }
    >
      <ScheduleTable entries={data.event.scheduleEntries} notes={data.event.notes} />
    </PanelCard>
  );
}

function WaiversTab({
  data,
  saving,
  onSave,
}: {
  data: PortalData;
  saving: boolean;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const [participantCode, setParticipantCode] = useState(data.event.participantCode || "");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveParticipantCode() {
    setSaved(false);
    await onSave({ participantCode });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  async function copyCode() {
    if (!participantCode || !navigator.clipboard) return;
    await navigator.clipboard.writeText(participantCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <PanelCard title="Waiver Collection">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              Submitted
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-tight">
              {data.waiver.submittedCount}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              Form
            </p>
            <p className="mt-2 break-words font-mono text-sm">{data.waiver.formSlug}</p>
          </div>
        </div>

        <a
          href={data.waiver.url}
          className="mt-5 inline-flex rounded-full bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
        >
          Fill Out Waiver
        </a>

        {data.role === "facilitator" ? (
          <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
            <label className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              Participant Code
              <input
                type="text"
                value={participantCode}
                onChange={(event) => setParticipantCode(event.target.value)}
                autoComplete="off"
                className="mt-2 block w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveParticipantCode}
                disabled={saving}
                className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Code"}
              </button>
              <button
                type="button"
                onClick={copyCode}
                className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                {copied ? "Copied" : "Copy Code"}
              </button>
            </div>
            {saved ? (
              <p className="mt-2 text-sm font-medium text-emerald-700">Saved</p>
            ) : null}
          </div>
        ) : null}
      </PanelCard>

      <PanelCard title="Submitted Participants">
        <div className="max-h-[min(560px,66vh)] overflow-y-auto pr-1">
          {data.waiver.submissions.length > 0 ? (
            <div className="divide-y divide-[var(--color-border)]">
              {data.waiver.submissions.map((submission) => (
                <div key={submission.id} className="py-3 first:pt-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{submission.name}</p>
                      {data.role === "facilitator" && (submission.email || submission.phone) ? (
                        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                          {[submission.email, submission.phone].filter(Boolean).join(" - ")}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      {formatSubmittedAt(submission.submittedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-5 text-sm text-[var(--color-ink-muted)]">
              No waiver submissions have been received yet.
            </p>
          )}
        </div>
      </PanelCard>
    </div>
  );
}

export default function EventPortalClient() {
  const [code, setCode] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("properties");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadWithCode(nextCode: string) {
    const normalizedCode = clean(nextCode);
    if (!normalizedCode) {
      setError("Enter an event code.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/events/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: normalizedCode }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || "Could not open that event.");
      }
      sessionStorage.setItem(STORAGE_KEY, normalizedCode);
      setCode(normalizedCode);
      setData(json as PortalData);
      setActiveTab("properties");
    } catch (err) {
      sessionStorage.removeItem(STORAGE_KEY);
      setData(null);
      setError(err instanceof Error ? err.message : "Could not open that event.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get("code") || "";
    const storedCode = sessionStorage.getItem(STORAGE_KEY) || "";
    const initialCode = codeFromUrl || storedCode;
    setCode(initialCode);
    if (codeFromUrl) {
      window.history.replaceState(null, "", "/event");
    }
    if (initialCode) {
      void loadWithCode(initialCode);
    } else {
      setLoading(false);
    }
  }, []);

  async function saveEventUpdates(updates: Record<string, unknown>) {
    if (!data || data.role !== "facilitator") return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(data.event.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ facilitatorCode: code, updates }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || "Could not save event changes.");
      }
      setData(json as PortalData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save event changes.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  function logout() {
    sessionStorage.removeItem(STORAGE_KEY);
    setCode("");
    setData(null);
    setError("");
  }

  if (!data) {
    return (
      <LoginPanel
        initialCode={code}
        loading={loading}
        error={error}
        onSubmit={(nextCode) => void loadWithCode(nextCode)}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="shrink-0 border-b border-[var(--color-border)] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
              Zenfulcove Event
            </p>
            <h1 className="mt-1 font-serif text-3xl font-medium leading-tight tracking-tight">
              {data.event.name}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              {formatDateRange(data.event.startDate, data.event.endDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
              {data.role}
            </span>
            <button
              type="button"
              onClick={() => void loadWithCode(code)}
              className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col px-4 py-4 md:px-6">
        <div
          role="tablist"
          aria-label="Event sections"
          className="mb-4 grid shrink-0 grid-cols-2 gap-2 rounded-2xl border border-[var(--color-border)] bg-white p-2 shadow-sm md:flex"
        >
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition md:min-w-32 ${
                  active
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-ink-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-ink)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {error ? (
          <p className="mb-4 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {activeTab === "properties" ? (
            <PropertiesTab properties={data.properties} />
          ) : null}
          {activeTab === "amenities" ? (
            <AmenitiesTab
              properties={data.properties}
              kayaks={data.kayaks}
              localGuides={data.localGuides}
            />
          ) : null}
          {activeTab === "schedule" ? (
            <ScheduleTab data={data} saving={saving} onSave={saveEventUpdates} />
          ) : null}
          {activeTab === "waivers" ? (
            <WaiversTab
              key={data.event.participantCode || ""}
              data={data}
              saving={saving}
              onSave={saveEventUpdates}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
