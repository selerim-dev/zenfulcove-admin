import { timingSafeEqual } from "node:crypto";
import { listLocalFormSubmissionsForBooking } from "@/lib/local-forms";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import {
  colorLabel,
  PROPERTY_INCLUDED_KAYAKS,
  PROPERTY_TO_CABIN,
  type Kayak,
} from "@/lib/types";

export type EventRole = "facilitator" | "participant";

export type EventScheduleEntry = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  location: string;
  description: string;
};

export type EventPortalEvent = {
  id: string;
  name: string;
  active: boolean;
  facilitatorCode: string;
  participantCode: string;
  startDate: string;
  endDate: string;
  propertyIds: string[];
  scheduleEntries: EventScheduleEntry[];
  notes: string;
  updatedAt?: string;
};

type EventPortalConfig = {
  enabled?: boolean;
  waiverFormSlug?: string;
  events?: Partial<EventPortalEvent>[];
};

const KNOWN_PROPERTIES = Object.entries(PROPERTY_TO_CABIN).map(([id, name]) => ({
  id,
  name,
}));

const PROPERTY_IMAGE_URLS: Record<string, string> = {
  "608952": "/stays/fairy.jpg",
  "608953": "/stays/desert.jpg",
  "608954": "/stays/sky.jpg",
  "608955": "/stays/bird.jpg",
  "754651": "/stays/doodle.jpg",
};

function clean(value: unknown, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeLookupKey(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function safeCodeEquals(leftValue: unknown, rightValue: unknown) {
  const left = clean(leftValue, 128);
  const right = clean(rightValue, 128);
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function normalizeScheduleEntry(
  entry: Partial<EventScheduleEntry> | undefined,
  index: number
): EventScheduleEntry {
  return {
    id: clean(entry?.id, 120) || `schedule-${index + 1}`,
    date: clean(entry?.date, 20),
    startTime: clean(entry?.startTime, 20),
    endTime: clean(entry?.endTime, 20),
    title: clean(entry?.title, 180),
    location: clean(entry?.location, 180),
    description: clean(entry?.description, 1000),
  };
}

function scheduleSort(a: EventScheduleEntry, b: EventScheduleEntry) {
  return (
    a.date.localeCompare(b.date) ||
    a.startTime.localeCompare(b.startTime) ||
    a.endTime.localeCompare(b.endTime) ||
    a.title.localeCompare(b.title)
  );
}

export function normalizeEventPortalConfig(config: EventPortalConfig = {}) {
  const events = Array.isArray(config.events) ? config.events : [];
  return {
    enabled: config.enabled !== false,
    waiverFormSlug: normalizeFormSlug(config.waiverFormSlug || "welcome-to-zenfulcove"),
    events: events
      .map((event, index): EventPortalEvent => {
        const id = clean(event.id, 120) || `event-${index + 1}`;
        return {
          id,
          name: clean(event.name, 160) || "Untitled Event",
          active: event.active !== false,
          facilitatorCode: clean(event.facilitatorCode, 128),
          participantCode: clean(event.participantCode, 128),
          startDate: clean(event.startDate, 20),
          endDate: clean(event.endDate, 20),
          propertyIds: Array.isArray(event.propertyIds)
            ? event.propertyIds.map((value) => clean(value, 60)).filter(Boolean)
            : [],
          scheduleEntries: Array.isArray(event.scheduleEntries)
            ? event.scheduleEntries
                .map((entry, entryIndex) => normalizeScheduleEntry(entry, entryIndex))
                .filter((entry) => entry.date || entry.title || entry.description)
                .sort(scheduleSort)
            : [],
          notes: clean(event.notes, 6000),
          updatedAt: clean(event.updatedAt, 40) || undefined,
        };
      })
      .filter((event) => event.id),
  };
}

export function normalizeFormSlug(value: unknown) {
  return clean(value, 160).replace(/^\/?forms\//, "") || "welcome-to-zenfulcove";
}

export function resolveEventWaiverFormSlug(config: {
  eventPortal?: EventPortalConfig;
  accessCodeRelease?: { localFormSlug?: string };
  waiverReminders?: { localFormSlug?: string };
}) {
  return normalizeFormSlug(
    config.eventPortal?.waiverFormSlug ||
      config.accessCodeRelease?.localFormSlug ||
      config.waiverReminders?.localFormSlug ||
      "welcome-to-zenfulcove"
  );
}

export function authenticateEventCode(config: EventPortalConfig, code: unknown) {
  const portal = normalizeEventPortalConfig(config);
  const submittedCode = clean(code, 128);
  if (!portal.enabled || !submittedCode) return null;

  for (const event of portal.events) {
    if (!event.active) continue;
    if (safeCodeEquals(event.facilitatorCode, submittedCode)) {
      return { role: "facilitator" as const, event };
    }
  }

  for (const event of portal.events) {
    if (!event.active) continue;
    if (safeCodeEquals(event.participantCode, submittedCode)) {
      return { role: "participant" as const, event };
    }
  }

  return null;
}

export function participantCodeConflict({
  config,
  eventId,
  code,
}: {
  config: EventPortalConfig;
  eventId: string;
  code: unknown;
}) {
  const portal = normalizeEventPortalConfig(config);
  const nextCode = clean(code, 128);
  if (!nextCode) return "";

  for (const event of portal.events) {
    if (event.id === eventId && safeCodeEquals(event.facilitatorCode, nextCode)) {
      return "Participant code cannot match the facilitator code.";
    }
    if (event.id !== eventId) {
      if (safeCodeEquals(event.facilitatorCode, nextCode)) {
        return "Participant code is already used as a facilitator code.";
      }
      if (safeCodeEquals(event.participantCode, nextCode)) {
        return "Participant code is already used by another event.";
      }
    }
  }

  return "";
}

export function publicEventForRole(event: EventPortalEvent, role: EventRole) {
  return {
    id: event.id,
    name: event.name,
    active: event.active,
    status: eventStatus(event),
    startDate: event.startDate,
    endDate: event.endDate,
    propertyIds: event.propertyIds,
    scheduleEntries: event.scheduleEntries,
    notes: event.notes,
    participantCode: role === "facilitator" ? event.participantCode : undefined,
  };
}

export function eventStatus(event: EventPortalEvent) {
  if (!event.active) return "inactive";
  if (!event.startDate && !event.endDate) return "undated";
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = event.startDate ? new Date(`${event.startDate}T00:00:00`) : null;
  const end = event.endDate ? new Date(`${event.endDate}T23:59:59`) : start;
  if (start && todayOnly < start) return "upcoming";
  if (end && todayOnly > end) return "past";
  return "active";
}

function mapEntryForProperty(map: unknown, property: { id: string; name: string }) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return null;
  const record = map as Record<string, unknown>;
  const candidates = [
    property.id,
    property.name,
    normalizeLookupKey(property.id),
    normalizeLookupKey(property.name),
  ].filter(Boolean);

  for (const key of candidates) {
    if (record[key] !== undefined) return record[key];
  }

  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeLookupKey(key);
    if (
      candidates.some(
        (candidate) =>
          candidate === normalizedKey ||
          candidate.includes(normalizedKey) ||
          normalizedKey.includes(candidate)
      )
    ) {
      return value;
    }
  }

  return null;
}

function propertyDataFor(config: Record<string, unknown>, property: { id: string; name: string }) {
  const value = mapEntryForProperty(config.propertyMessageData, property);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function propertyCodeFor(config: Record<string, unknown>, property: { id: string; name: string }) {
  const value = mapEntryForProperty(config.propertyCodes, property);
  return clean(value, 80);
}

export function buildEventProperties(config: Record<string, unknown>, propertyIds: string[]) {
  const includedIds = propertyIds.length > 0 ? new Set(propertyIds.map(String)) : null;
  return KNOWN_PROPERTIES.filter((property) => !includedIds || includedIds.has(property.id)).map(
    (property) => {
      const data = propertyDataFor(config, property);
      const includedKayak = PROPERTY_INCLUDED_KAYAKS[Number(property.id)] || null;
      return {
        id: property.id,
        name: property.name,
        displayName: clean(data.displayName || data.propertyDisplayName, 120) || property.name,
        address: clean(data.address, 500),
        googleMapsAddress: clean(data.googleMapsAddress, 500),
        googleMapsUrl: clean(data.googleMapsUrl || data.googleMapsURL, 800),
        unitDirections: clean(data.unitDirections, 2000),
        parkingInstructions: clean(data.parkingInstructions, 2000),
        wifiName: clean(data.wifiName, 160),
        wifiPassword: clean(data.wifiPassword, 160),
        amenitiesText: clean(data.amenitiesText, 3000),
        goodToKnowText: clean(
          data.goodToKnowText || data.additionalRulesText || data.goodToKnow,
          3000
        ),
        accessCode: propertyCodeFor(config, property),
        includedKayak,
        imageUrl: PROPERTY_IMAGE_URLS[property.id] || "/landing.jpg",
      };
    }
  );
}

export function buildLocalGuides(config: Record<string, unknown>) {
  const customerPortal =
    config.customerPortal && typeof config.customerPortal === "object"
      ? (config.customerPortal as Record<string, unknown>)
      : {};
  const sections =
    customerPortal.myStaySections &&
    typeof customerPortal.myStaySections === "object" &&
    !Array.isArray(customerPortal.myStaySections)
      ? (customerPortal.myStaySections as Record<string, Record<string, unknown>>)
      : {};

  return Object.entries(sections)
    .map(([key, section]) => ({
      key,
      eyebrow: clean(section.eyebrow, 80) || "Local Guide",
      title: clean(section.title, 160),
      body: clean(section.body, 2000),
      linkLabel: clean(section.linkLabel, 80) || "Explore",
      linkUrl: clean(section.linkUrl, 800),
      enabled: section.enabled !== false,
    }))
    .filter((section) => section.enabled && (section.title || section.body || section.linkUrl));
}

export async function listEventKayaks() {
  if (!hasSupabaseAdminEnv()) return [];

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("kayaks")
    .select("id, name, code, capacity, length_feet, color, is_active, display_order")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return [];

  return ((data || []) as Kayak[]).map((kayak) => ({
    id: kayak.id,
    name: kayak.name,
    code: kayak.code || "",
    capacity: Number(kayak.capacity || 0),
    lengthFeet: kayak.length_feet ? Number(kayak.length_feet) : null,
    color: kayak.color || "",
    colorLabel: colorLabel(kayak.color || ""),
    isActive: kayak.is_active !== false,
  }));
}

function submissionName(submission: Record<string, unknown>) {
  const payload =
    submission.payload && typeof submission.payload === "object"
      ? (submission.payload as Record<string, unknown>)
      : {};
  const fullName = clean(payload.fullName || payload.name || payload.customerName, 180);
  if (fullName) return fullName;
  return [submission.first_name, submission.last_name]
    .map((part) => clean(part, 80))
    .filter(Boolean)
    .join(" ");
}

export async function buildWaiverSummary({
  eventId,
  formSlug,
  role,
}: {
  eventId: string;
  formSlug: string;
  role: EventRole;
}) {
  if (!hasSupabaseAdminEnv()) {
    return {
      submittedCount: 0,
      submissions: [],
      databaseAvailable: false,
    };
  }

  const submissions = await listLocalFormSubmissionsForBooking({
    formSlug,
    bookingId: eventId,
    limit: 10000,
  }).catch(() => []);

  return {
    submittedCount: submissions.length,
    databaseAvailable: true,
    submissions: submissions.map((submission: Record<string, unknown>) => ({
      id: clean(submission.id, 120),
      name: submissionName(submission) || "Participant",
      email: role === "facilitator" ? clean(submission.email, 180) : "",
      phone: role === "facilitator" ? clean(submission.phone, 80) : "",
      submittedAt: clean(submission.submitted_at, 80),
    })),
  };
}

export function eventWaiverUrl(eventId: string, formSlug: string) {
  const params = new URLSearchParams();
  params.set("reservation", eventId);
  params.set("event", "1");
  params.set("returnTo", "/event");
  return `/forms/${normalizeFormSlug(formSlug)}?${params.toString()}`;
}

export async function buildEventPortalPayload({
  config,
  event,
  role,
}: {
  config: Record<string, unknown>;
  event: EventPortalEvent;
  role: EventRole;
}) {
  const eventPortal =
    config.eventPortal && typeof config.eventPortal === "object"
      ? (config.eventPortal as EventPortalConfig)
      : {};
  const accessCodeRelease =
    config.accessCodeRelease && typeof config.accessCodeRelease === "object"
      ? (config.accessCodeRelease as Record<string, unknown>)
      : {};
  const formSlug = resolveEventWaiverFormSlug({
    eventPortal,
    accessCodeRelease: accessCodeRelease as { localFormSlug?: string },
    waiverReminders: config.waiverReminders as { localFormSlug?: string },
  });
  const [kayaks, waiverSummary] = await Promise.all([
    listEventKayaks(),
    buildWaiverSummary({ eventId: event.id, formSlug, role }),
  ]);

  return {
    ok: true,
    role,
    event: publicEventForRole(event, role),
    properties: buildEventProperties(accessCodeRelease, event.propertyIds),
    kayaks,
    localGuides: buildLocalGuides(config),
    waiver: {
      formSlug,
      url: eventWaiverUrl(event.id, formSlug),
      ...waiverSummary,
    },
  };
}

export function updateEventInConfig({
  currentConfig,
  eventId,
  updates,
}: {
  currentConfig: Record<string, unknown>;
  eventId: string;
  updates: Record<string, unknown>;
}) {
  const currentPortal =
    currentConfig.eventPortal && typeof currentConfig.eventPortal === "object"
      ? (currentConfig.eventPortal as EventPortalConfig)
      : {};
  const portal = normalizeEventPortalConfig(currentPortal);
  const normalizedEventId = clean(eventId, 120);
  const eventIndex = portal.events.findIndex((event) => event.id === normalizedEventId);
  if (eventIndex < 0) return null;

  const currentEvent = portal.events[eventIndex];
  const nextEvent: EventPortalEvent = {
    ...currentEvent,
    participantCode:
      updates.participantCode !== undefined
        ? clean(updates.participantCode, 128)
        : currentEvent.participantCode,
    scheduleEntries: Array.isArray(updates.scheduleEntries)
      ? updates.scheduleEntries
          .map((entry, index) =>
            normalizeScheduleEntry(entry as Partial<EventScheduleEntry>, index)
          )
          .filter((entry) => entry.date || entry.title || entry.description)
          .sort(scheduleSort)
      : currentEvent.scheduleEntries,
    notes: updates.notes !== undefined ? clean(updates.notes, 6000) : currentEvent.notes,
    updatedAt: new Date().toISOString(),
  };

  const nextEvents = [...portal.events];
  nextEvents[eventIndex] = nextEvent;

  return {
    nextConfig: {
      ...currentConfig,
      eventPortal: {
        ...currentPortal,
        enabled: portal.enabled,
        waiverFormSlug: portal.waiverFormSlug,
        events: nextEvents,
      },
    },
    event: nextEvent,
  };
}
