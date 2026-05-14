// All date math runs in the property's local timezone (Austin, Texas) so the
// server's host timezone (UTC on Vercel) doesn't shift "today" by a day.

export const PROPERTY_TIMEZONE = "America/Chicago";

const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PROPERTY_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayIso(): string {
  // en-CA returns YYYY-MM-DD natively.
  return isoFormatter.format(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000;
  const date = new Date(ms);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// A reference Date for an ISO calendar day, safe to format with timeZone.
function refDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function formatDow(iso: string): string {
  return refDate(iso)
    .toLocaleDateString("en-US", {
      timeZone: PROPERTY_TIMEZONE,
      weekday: "short",
    })
    .toUpperCase();
}

export function dayNumber(iso: string): number {
  return Number(iso.split("-")[2]);
}

export function formatMonthYear(iso: string): string {
  return refDate(iso)
    .toLocaleDateString("en-US", {
      timeZone: PROPERTY_TIMEZONE,
      month: "long",
      year: "numeric",
    })
    .toUpperCase();
}

export function formatLongDate(iso: string): string {
  return refDate(iso)
    .toLocaleDateString("en-US", {
      timeZone: PROPERTY_TIMEZONE,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}

// Convert a wall-clock time in the property timezone to the corresponding UTC moment.
export function propertyTimeToUtc(
  iso: string,
  hours: number,
  minutes = 0
): Date {
  const naive = new Date(
    `${iso}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:00Z`
  );
  const offsetMinutes = tzOffsetMinutes(naive, PROPERTY_TIMEZONE);
  return new Date(naive.getTime() - offsetMinutes * 60000);
}

function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  // hour can be "24" in some Node versions; normalize to 0.
  const hour = get("hour") % 24;
  const tzMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second")
  );
  return (tzMs - date.getTime()) / 60000;
}

// Day boundaries (UTC) for an ISO date in the property timezone — used for
// range queries against `bookings.starts_at` / `bookings.ends_at`.
export function dayBoundsUtc(iso: string): { start: Date; end: Date } {
  const start = propertyTimeToUtc(iso, 0, 0);
  const end = propertyTimeToUtc(addDaysIso(iso, 1), 0, 0);
  return { start, end };
}
