import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseRuntimeEnv } from "@/lib/supabaseEnv";
import { type Kayak } from "@/lib/types";
import {
  addDaysIso,
  dayBoundsUtc,
  dayNumber,
  formatDow,
  todayIso,
} from "@/lib/dates";
import FleetCalendar from "./FleetCalendar";

export const dynamic = "force-dynamic";

const BOOKING_WINDOW_DAYS = 90;

export default async function FleetPage() {
  const isSupabaseConfigured = hasSupabaseRuntimeEnv();
  let kayaks: Kayak[] = [];

  const today = todayIso();
  const rangeStart = dayBoundsUtc(today).start;
  const rangeEnd = dayBoundsUtc(addDaysIso(today, BOOKING_WINDOW_DAYS)).start;

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

  const days = Array.from({ length: BOOKING_WINDOW_DAYS }, (_, i) => {
    const iso = addDaysIso(today, i);
    return {
      iso,
      dow: formatDow(iso),
      day: dayNumber(iso),
    };
  });

  const bookedByKayak: Record<string, string[]> = {};
  for (const k of kayaks) {
    const ids: string[] = [];
    for (const d of days) {
      const { start, end } = dayBoundsUtc(d.iso);
      const isOut = overlaps.some(
        (b) => b.kayakId === k.id && b.start < end && b.end > start
      );
      if (isOut) ids.push(d.iso);
    }
    bookedByKayak[k.id] = ids;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
          Customer Portal
        </p>
        <h1 className="mt-2 font-serif text-4xl font-medium leading-[1.05] tracking-tight md:text-5xl">
          Availability calendar.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Select a rental to review its details, then pick an available date in
          the next 90 days to reserve it.
        </p>
      </header>

      {!isSupabaseConfigured ? (
        <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-ink-muted)]">
          Portal availability is ready to connect. Add the Supabase URL, anon
          key, and service-role key to this environment, then run the setup SQL
          in <span className="font-mono">supabase/sql</span>.
        </p>
      ) : kayaks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-ink-muted)]">
          No rentals in the portal yet.
        </p>
      ) : (
        <FleetCalendar
          kayaks={kayaks}
          days={days}
          bookedByKayak={bookedByKayak}
        />
      )}
    </div>
  );
}
