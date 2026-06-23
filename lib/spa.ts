import { PROPERTY_TIMEZONE, propertyTimeToUtc } from "@/lib/dates";
import type { MassageTherapist } from "@/lib/types";

export type SpaInterval = { start: Date; end: Date };
export type SpaSlot = { iso: string; label: string };

const MIN = 60_000;

function overlaps(a: SpaInterval, b: SpaInterval) {
  return a.start < b.end && b.start < a.end;
}

/** Day of week (0=Sun…6=Sat) for an ISO calendar date, tz-stable. */
function isoDayOfWeek(iso: string) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** Human label for a slot start, e.g. "10:30 AM", in the property timezone. */
export function slotLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: PROPERTY_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The interval a confirmed booking occupies: the appointment plus the buffer
 * (setup/travel) after it. This is what we store as starts_at/ends_at and what
 * the no_therapist_overlap exclusion constraint guards.
 */
export function bookingInterval(
  startIso: string,
  durationMin: number,
  bufferMin: number
): { startsAtIso: string; endsAtIso: string } {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + (durationMin + bufferMin) * MIN);
  return { startsAtIso: start.toISOString(), endsAtIso: end.toISOString() };
}

/**
 * Generate bookable start times for a therapist on a given calendar date.
 * A slot is offered only when:
 *  - the full appointment fits inside a working-hours window for that weekday,
 *  - it starts at/after now + lead time,
 *  - and its padded interval (buffer on both sides) doesn't hit any busy block
 *    (Google calendar events + existing portal bookings).
 * Working hours are interpreted in the property timezone (America/Chicago),
 * which is the therapist default in v1.
 */
export function generateSlots({
  therapist,
  durationMin,
  dateIso,
  busy,
  now = new Date(),
}: {
  therapist: MassageTherapist;
  durationMin: number;
  dateIso: string;
  busy: SpaInterval[];
  now?: Date;
}): SpaSlot[] {
  const windows = therapist.weekly_hours?.[String(isoDayOfWeek(dateIso))];
  if (!Array.isArray(windows) || windows.length === 0) return [];

  const interval = Math.max(5, therapist.slot_interval_min || 30);
  const buffer = Math.max(0, therapist.buffer_min || 0);
  const earliest = now.getTime() + Math.max(0, therapist.lead_time_hours || 0) * 60 * MIN;

  const slots: SpaSlot[] = [];
  const seen = new Set<string>();

  for (const window of windows) {
    const [open, close] = window;
    const [oh, om] = String(open).split(":").map(Number);
    const [ch, cm] = String(close).split(":").map(Number);
    if (![oh, om, ch, cm].every(Number.isFinite)) continue;

    const openUtc = propertyTimeToUtc(dateIso, oh, om).getTime();
    const closeUtc = propertyTimeToUtc(dateIso, ch, cm).getTime();

    for (let t = openUtc; t + durationMin * MIN <= closeUtc; t += interval * MIN) {
      if (t < earliest) continue;
      const padded: SpaInterval = {
        start: new Date(t - buffer * MIN),
        end: new Date(t + (durationMin + buffer) * MIN),
      };
      if (busy.some((b) => overlaps(padded, b))) continue;

      const iso = new Date(t).toISOString();
      if (seen.has(iso)) continue;
      seen.add(iso);
      slots.push({ iso, label: slotLabel(iso) });
    }
  }

  slots.sort((a, b) => a.iso.localeCompare(b.iso));
  return slots;
}
