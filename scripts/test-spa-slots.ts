// Pure-logic test for in-cabin-massage availability slot generation.
// No Stripe / Google / DB — just exercises generateSlots() so you can confirm
// the master-hours window, slot interval, buffer, and busy-block subtraction.
//
// Run: npx --yes tsx scripts/test-spa-slots.ts   (or: npm run test:spa-slots)

import { propertyTimeToUtc } from "@/lib/dates";
import { generateSlots, type SpaInterval } from "@/lib/spa";
import type { MassageTherapist, WeeklyHours } from "@/lib/types";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${label}`);
  if (!cond) failures += 1;
}

const therapist: MassageTherapist = {
  id: "test",
  name: "Test Therapist",
  phone: null,
  google_calendar_id: null,
  timezone: "America/Chicago",
  weekly_hours: {},
  slot_interval_min: 30,
  buffer_min: 30,
  lead_time_hours: 0,
  is_active: true,
  display_order: 0,
  created_at: "",
  updated_at: "",
};

// Master accepted hours: 09:00–17:00 every day.
const masterHours: WeeklyHours = Object.fromEntries(
  ["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, [["09:00", "17:00"]]])
);

const dateIso = "2026-06-15";
const past = new Date("2000-01-01T00:00:00Z"); // so lead time never filters
const labels = (slots: { label: string }[]) => slots.map((s) => s.label);

// --- Scenario A: no conflicts ------------------------------------------------
const a = generateSlots({
  therapist,
  masterHours,
  durationMin: 60,
  dateIso,
  busy: [],
  now: past,
});
console.log("\nA) 60-min, no busy:", labels(a).join(", "));
check("A: 15 slots (9:00–16:00 every 30m)", a.length === 15);
check("A: first slot 9:00 AM", a[0]?.label === "9:00 AM");
check("A: last slot 4:00 PM (60m ends by 17:00)", labels(a).includes("4:00 PM"));
check("A: no 4:30 PM (would end after 17:00)", !labels(a).includes("4:30 PM"));

// --- Scenario B: a 12:00–13:00 busy block (e.g. a MassageBook appt) ----------
const busy: SpaInterval[] = [
  {
    start: propertyTimeToUtc(dateIso, 12, 0),
    end: propertyTimeToUtc(dateIso, 13, 0),
  },
];
const b = generateSlots({
  therapist,
  masterHours,
  durationMin: 60,
  dateIso,
  busy,
  now: past,
});
console.log("\nB) 60-min, busy 12–1pm:", labels(b).join(", "));
check("B: 10 slots (5 removed around the busy block + buffer)", b.length === 10);
check("B: no 12:00 PM", !labels(b).includes("12:00 PM"));
check("B: no 11:00 AM (buffer collision)", !labels(b).includes("11:00 AM"));
check("B: keeps 10:30 AM (clears with buffer)", labels(b).includes("10:30 AM"));
check("B: keeps 1:30 PM (clears with buffer)", labels(b).includes("1:30 PM"));

// --- Scenario C: master closed that day --------------------------------------
const c = generateSlots({
  therapist,
  masterHours: {},
  durationMin: 60,
  dateIso,
  busy: [],
  now: past,
});
check("\nC: master with no hours → 0 slots", c.length === 0);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exitCode = failures === 0 ? 0 : 1;
