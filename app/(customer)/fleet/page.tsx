import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseRuntimeEnv } from "@/lib/supabaseEnv";
import { PROPERTY_TO_CABIN, type Kayak } from "@/lib/types";
import { fetchReservationById, LodgifyError } from "@/lib/customer/lodgify";
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

function lastNameMatches(
  guestName: string | null | undefined,
  input: string
) {
  if (!input) return true;
  if (!guestName) return false;
  const normalizedGuest = guestName.toLowerCase().trim();
  const normalizedInput = input.toLowerCase().trim();
  const words = normalizedGuest.split(/\s+/);
  return words.includes(normalizedInput) || normalizedGuest.endsWith(normalizedInput);
}

export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<{
    reservation?: string;
    lastName?: string;
  }>;
}) {
  const { reservation = "", lastName = "" } = await searchParams;
  const reservationId = reservation.trim();
  const guestLastName = lastName.trim();
  if (!reservationId) redirect("/book?target=fleet");

  let verifiedReservation;
  try {
    verifiedReservation = await fetchReservationById(reservationId);
  } catch (err) {
    const detail = err instanceof LodgifyError ? err.detail : String(err);
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-600">
          Kayak Availability
        </p>
        <h1 className="mt-2 font-serif text-4xl font-medium tracking-tight">
          We could not verify that booking.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Lodgify could not be reached: {detail.slice(0, 160)}
        </p>
      </div>
    );
  }

  if (
    !verifiedReservation ||
    !PROPERTY_TO_CABIN[verifiedReservation.propertyId] ||
    !lastNameMatches(verifiedReservation.guestName, guestLastName) ||
    verifiedReservation.departureIso < todayIso()
  ) {
    redirect("/book?target=fleet");
  }

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
          Kayak availability.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Verified guests can select a rental kayak, review its details, and
          pick an available date in the next 90 days to reserve it.
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
