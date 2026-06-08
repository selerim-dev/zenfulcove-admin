"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

type EventScheduleEntry = {
  id?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  location?: string;
  description?: string;
};

type EventPortalEvent = {
  id?: string;
  name?: string;
  active?: boolean;
  facilitatorCode?: string;
  participantCode?: string;
  startDate?: string;
  endDate?: string;
  propertyIds?: string[];
  scheduleEntries?: EventScheduleEntry[];
  notes?: string;
};

export type EventPortalConfig = {
  enabled?: boolean;
  waiverFormSlug?: string;
  events?: EventPortalEvent[];
};

const KNOWN_PROPERTIES = [
  { id: "608952", name: "Fairy House" },
  { id: "608953", name: "Desert Rose" },
  { id: "608954", name: "Sky Castle" },
  { id: "608955", name: "Bird House" },
  { id: "754651", name: "Doodle House" },
];

function clean(value: unknown) {
  return String(value || "").trim();
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function eventDateLabel(event: EventPortalEvent) {
  const start = clean(event.startDate);
  const end = clean(event.endDate);
  if (start && end && start !== end) return `${start} to ${end}`;
  return start || end || "Dates not set";
}

function normalizeEvents(events: EventPortalEvent[] | undefined) {
  return Array.isArray(events) ? events : [];
}

function codesConflict(event: EventPortalEvent) {
  const facilitatorCode = clean(event.facilitatorCode).toLowerCase();
  const participantCode = clean(event.participantCode).toLowerCase();
  return Boolean(facilitatorCode && participantCode && facilitatorCode === participantCode);
}

function newEventFromDraft(draft: EventPortalEvent): EventPortalEvent {
  return {
    id: makeId(),
    name: clean(draft.name) || "Untitled Event",
    active: true,
    facilitatorCode: clean(draft.facilitatorCode),
    participantCode: clean(draft.participantCode),
    startDate: clean(draft.startDate),
    endDate: clean(draft.endDate),
    propertyIds: Array.isArray(draft.propertyIds)
      ? draft.propertyIds
      : KNOWN_PROPERTIES.map((property) => property.id),
    scheduleEntries: [],
    notes: "",
  };
}

function blankDraft(): EventPortalEvent {
  return {
    name: "",
    facilitatorCode: "",
    participantCode: "",
    startDate: "",
    endDate: "",
    propertyIds: KNOWN_PROPERTIES.map((property) => property.id),
  };
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-xs uppercase tracking-wider text-forest/60 ${className}`}>
      {label}
      {children}
    </label>
  );
}

function EventFormFields({
  event,
  onChange,
}: {
  event: EventPortalEvent;
  onChange: (patch: Partial<EventPortalEvent>) => void;
}) {
  const propertyIds = Array.isArray(event.propertyIds) ? event.propertyIds : [];
  const hasCodeConflict = codesConflict(event);

  function toggleProperty(propertyId: string, checked: boolean) {
    const next = checked
      ? Array.from(new Set([...propertyIds, propertyId]))
      : propertyIds.filter((id) => id !== propertyId);
    onChange({ propertyIds: next });
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Event Name">
          <input
            type="text"
            value={event.name || ""}
            onChange={(changeEvent) => onChange({ name: changeEvent.target.value })}
            className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
        </Field>
        <Field label="Facilitator Code">
          <input
            type="text"
            value={event.facilitatorCode || ""}
            onChange={(changeEvent) =>
              onChange({ facilitatorCode: changeEvent.target.value })
            }
            autoComplete="off"
            className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
        </Field>
        <Field label="Start Date">
          <input
            type="date"
            value={event.startDate || ""}
            onChange={(changeEvent) => onChange({ startDate: changeEvent.target.value })}
            className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
        </Field>
        <Field label="End Date">
          <input
            type="date"
            value={event.endDate || ""}
            min={event.startDate || undefined}
            onChange={(changeEvent) => onChange({ endDate: changeEvent.target.value })}
            className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
        </Field>
        <Field label="Participant Code" className="md:col-span-2">
          <input
            type="text"
            value={event.participantCode || ""}
            onChange={(changeEvent) =>
              onChange({ participantCode: changeEvent.target.value })
            }
            autoComplete="off"
            className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <span className="mt-1 block text-xs normal-case tracking-normal text-forest/40">
            Facilitators can update this in the event portal.
          </span>
          {hasCodeConflict ? (
            <span className="mt-1 block text-xs normal-case tracking-normal text-red-700">
              Participant code must be different from the facilitator code.
            </span>
          ) : null}
        </Field>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-forest/60">
          Included Properties
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {KNOWN_PROPERTIES.map((property) => (
            <label
              key={property.id}
              className="flex items-center gap-2 rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest"
            >
              <input
                type="checkbox"
                checked={propertyIds.includes(property.id)}
                onChange={(changeEvent) =>
                  toggleProperty(property.id, changeEvent.target.checked)
                }
                className="h-4 w-4 accent-grove"
              />
              {property.name}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

function AddEventModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (event: EventPortalEvent) => void;
}) {
  const [draft, setDraft] = useState<EventPortalEvent>(() => blankDraft());

  if (!open) return null;

  function close() {
    setDraft(blankDraft());
    onClose();
  }

  function add() {
    onAdd(newEventFromDraft(draft));
    setDraft(blankDraft());
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-forest/40 px-4 py-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-event-title"
        className="w-full max-w-3xl rounded-xl border border-sand bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-grove">
              Events
            </p>
            <h3 id="add-event-title" className="mt-1 font-serif text-2xl text-forest">
              Add Event
            </h3>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-full border border-sand bg-white px-3 py-1 text-xs font-medium text-forest/70 transition hover:border-grove hover:text-grove"
          >
            Close
          </button>
        </div>

        <div className="mt-5 max-h-[min(640px,72vh)] space-y-5 overflow-y-auto pr-1">
          <EventFormFields
            event={draft}
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-sand pt-4">
          <button
            type="button"
            onClick={close}
            className="rounded-full border border-sand bg-white px-4 py-2 text-sm font-medium text-forest transition hover:border-grove hover:text-grove"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={add}
            className="rounded-full bg-grove px-5 py-2 text-sm font-medium text-white transition hover:bg-forest"
          >
            Add Event
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EventSettingsPanel({
  config = {},
  onChange,
}: {
  config?: EventPortalConfig;
  onChange?: (updated: EventPortalConfig) => void;
}) {
  const events = useMemo(() => normalizeEvents(config.events), [config.events]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) || null;

  function updateConfig(next: Partial<EventPortalConfig>) {
    onChange?.({
      enabled: config.enabled !== false,
      waiverFormSlug: config.waiverFormSlug || "welcome-to-zenfulcove",
      events,
      ...config,
      ...next,
    });
  }

  function addEvent(event: EventPortalEvent) {
    updateConfig({ events: [event, ...events] });
    setSelectedEventId("");
    setAddOpen(false);
  }

  function updateEvent(eventId: string | undefined, patch: Partial<EventPortalEvent>) {
    if (!eventId) return;
    updateConfig({
      events: events.map((event) =>
        event.id === eventId ? { ...event, ...patch } : event
      ),
    });
  }

  function removeEvent(eventId: string | undefined) {
    if (!eventId) return;
    if (!window.confirm("Delete this event?")) return;
    updateConfig({ events: events.filter((event) => event.id !== eventId) });
    setSelectedEventId("");
  }

  return (
    <section className="space-y-4 pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl text-forest">Event Library</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-forest/70">
            Select an event to edit it, or add a new one when a whole-property event is booked.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-full bg-grove px-4 py-2 text-sm font-medium text-white transition hover:bg-forest"
          >
            Add Event
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-sand bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-sand px-4 py-3">
              <span className="text-sm font-medium text-forest">Enabled</span>
              <input
                type="checkbox"
                checked={config.enabled !== false}
                onChange={(event) => updateConfig({ enabled: event.target.checked })}
                className="h-4 w-4 accent-grove"
              />
            </label>

            <Field label="Waiver Form Slug">
              <input
                type="text"
                value={config.waiverFormSlug || ""}
                onChange={(event) =>
                  updateConfig({ waiverFormSlug: event.target.value })
                }
                placeholder="welcome-to-zenfulcove"
                className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </Field>

            <div className="rounded-lg border border-sand bg-cream/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-forest/60">
                  Events
                </p>
                <span className="text-xs text-forest/40">{events.length}</span>
              </div>
              {events.length > 0 ? (
                <div className="max-h-[min(440px,58vh)] space-y-2 overflow-y-auto pr-1">
                  {events.map((event) => {
                    const active = event.id === selectedEvent?.id;
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => setSelectedEventId(event.id || "")}
                        className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                          active
                            ? "border-grove bg-white text-forest shadow-sm"
                            : "border-transparent text-forest/70 hover:border-sand hover:bg-white"
                        }`}
                      >
                        <span className="block text-sm font-medium">
                          {event.name || "Untitled Event"}
                        </span>
                        <span className="mt-1 block text-xs text-forest/45">
                          {eventDateLabel(event)}
                        </span>
                        <span
                          className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                            event.active === false
                              ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                              : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                          }`}
                        >
                          {event.active === false ? "Inactive" : "Active"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-sand bg-white p-4 text-sm leading-relaxed text-forest/55">
                  No events yet.
                </p>
              )}
            </div>
          </aside>

          <div className="min-w-0">
            {selectedEvent ? (
              <article className="rounded-xl border border-sand bg-cream/20 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-grove">
                      {eventDateLabel(selectedEvent)}
                    </p>
                    <h3 className="mt-1 font-serif text-2xl text-forest">
                      {selectedEvent.name || "Untitled Event"}
                    </h3>
                    <p className="mt-1 text-xs text-forest/50">
                      {selectedEvent.scheduleEntries?.length || 0} schedule items
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-forest">
                      <input
                        type="checkbox"
                        checked={selectedEvent.active !== false}
                        onChange={(changeEvent) =>
                          updateEvent(selectedEvent.id, {
                            active: changeEvent.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-grove"
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      onClick={() => removeEvent(selectedEvent.id)}
                      className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-5 max-h-[min(640px,72vh)] space-y-5 overflow-y-auto pr-1">
                  <EventFormFields
                    event={selectedEvent}
                    onChange={(patch) => updateEvent(selectedEvent.id, patch)}
                  />
                </div>
              </article>
            ) : (
              <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-sand bg-cream/30 p-8 text-center">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-grove">
                    Event Setup
                  </p>
                  <h3 className="mt-2 font-serif text-2xl text-forest">
                    Select an event to view or edit it.
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-forest/60">
                    Events stay collapsed in the list until you choose one, so this settings page stays readable.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AddEventModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={addEvent}
      />
    </section>
  );
}
