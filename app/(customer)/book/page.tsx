import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseRuntimeEnv } from "@/lib/supabaseEnv";
import type { Kayak } from "@/lib/types";
import {
  addDaysIso,
  dayBoundsUtc,
  dayNumber,
  formatDow,
  formatLongDate,
  todayIso,
} from "@/lib/dates";
import DateSelector from "./DateSelector";
import AvailableKayaks from "./AvailableKayaks";

export const dynamic = "force-dynamic";

const DAYS_AHEAD = 30;

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    reservation?: string;
    lastName?: string;
  }>;
}) {
  const { date, reservation = "", lastName = "" } = await searchParams;
  const today = todayIso();
  const selectedIso =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;

  const rangeStartIso = today;
  const rangeEndIso = addDaysIso(today, DAYS_AHEAD);
  const rangeStart = dayBoundsUtc(rangeStartIso).start;
  const rangeEnd = dayBoundsUtc(rangeEndIso).start;

  const isSupabaseConfigured = hasSupabaseRuntimeEnv();
  let kayaks: Kayak[] = [];
  let bookingRows:
    | { kayak_id: string | null; starts_at: string | null; ends_at: string | null }[]
    | null = [];

  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data: kayakRows } = await supabase
      .from("kayaks")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    kayaks = (kayakRows ?? []) as Kayak[];

    // Pull every booking overlapping the 30-day window (in property tz) so we
    // can compute availability per day and per kayak. Use the admin client
    // since RLS hides bookings from anon.
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("bookings")
      .select("kayak_id, starts_at, ends_at")
      .in("status", ["pending", "confirmed", "completed"])
      .lt("starts_at", rangeEnd.toISOString())
      .gt("ends_at", rangeStart.toISOString());
    bookingRows = data;
  }

  const overlaps = (bookingRows ?? []).map((b) => ({
    kayakId: b.kayak_id as string,
    start: new Date(b.starts_at as string),
    end: new Date(b.ends_at as string),
  }));

  function bookedKayakIdsOn(iso: string): Set<string> {
    const { start: dayStart, end: dayEnd } = dayBoundsUtc(iso);
    const set = new Set<string>();
    for (const b of overlaps) {
      if (b.start < dayEnd && b.end > dayStart) {
        set.add(b.kayakId);
      }
    }
    return set;
  }

  const dateOptions = Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const iso = addDaysIso(today, i);
    const booked = bookedKayakIdsOn(iso);
    return {
      iso,
      dow: formatDow(iso),
      day: dayNumber(iso),
      available: Math.max(0, kayaks.length - booked.size),
    };
  });

  const bookedToday = bookedKayakIdsOn(selectedIso);
  const bookedIds = Array.from(bookedToday);
  const available = kayaks.filter((k) => !bookedToday.has(k.id));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
          Guest Portal
        </p>
        <h1 className="mt-2 font-serif text-4xl font-medium leading-[1.05] tracking-tight md:text-5xl">
          Reserve an experience.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Pick a date and reserve available equipment for your stay. Kayaks are
          live now, and more guest portal tools will move here as we bring
          forms and stay details in-house.
        </p>
      </section>

      {isSupabaseConfigured ? (
        <>
          <DateSelector
            dates={dateOptions}
            selected={selectedIso}
            reservation={reservation}
            lastName={lastName}
          />

          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink)]">
                {formatLongDate(selectedIso)}
              </h2>
              <p className="text-sm font-medium text-[var(--color-ink-muted)]">
                {available.length === 0
                  ? "No rentals ready"
                  : available.length === 1
                    ? "1 rental ready"
                    : `${available.length} rentals ready`}
              </p>
            </div>

            {kayaks.length > 0 ? (
              <div className="mt-4">
                <AvailableKayaks
                  kayaks={kayaks}
                  bookedIds={bookedIds}
                  dateIso={selectedIso}
                  reservation={reservation}
                  lastName={lastName}
                />
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-ink-muted)]">
                No rentals in the portal yet. Add some in staff tools to get
                started.
              </p>
            )}
          </section>
        </>
      ) : (
        <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          The guest portal is ready to connect. Add the Supabase URL, anon key,
          and service-role key to this environment, then run the setup SQL in
          <span className="font-mono"> supabase/sql</span>.
        </p>
      )}
    </div>
  );
}
