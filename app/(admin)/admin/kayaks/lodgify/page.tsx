import Link from "next/link";
import {
  lodgifyGet,
  LodgifyError,
  listReservations,
  type LodgifyProperty,
  type NormalizedReservation,
} from "@/lib/customer/lodgify";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { PROPERTY_TO_CABIN } from "@/lib/types";
import { todayIso } from "@/lib/dates";

export const dynamic = "force-dynamic";

type PropertiesResult =
  | { ok: true; properties: LodgifyProperty[] }
  | { ok: false; status?: number; error: string };

type ReservationsResult =
  | { ok: true; reservations: NormalizedReservation[] }
  | { ok: false; status?: number; error: string };

async function fetchProperties(): Promise<PropertiesResult> {
  try {
    const data = await lodgifyGet<unknown>("/v2/properties");
    const properties = Array.isArray(data)
      ? (data as LodgifyProperty[])
      : Array.isArray((data as { items?: LodgifyProperty[] })?.items)
        ? (data as { items: LodgifyProperty[] }).items
        : [];
    return { ok: true, properties };
  } catch (err) {
    if (err instanceof LodgifyError) {
      return { ok: false, status: err.status, error: err.detail };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function fetchReservations(): Promise<ReservationsResult> {
  try {
    const reservations = await listReservations();
    return { ok: true, reservations };
  } catch (err) {
    if (err instanceof LodgifyError) {
      return { ok: false, status: err.status, error: err.detail };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function fetchUsedComplimentary(
  reservationIds: string[]
): Promise<Set<string>> {
  if (reservationIds.length === 0) return new Set();
  if (!hasSupabaseAdminEnv()) return new Set();

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("bookings")
    .select("lodgify_reservation_id")
    .in("lodgify_reservation_id", reservationIds)
    .eq("is_complimentary", true)
    .in("status", ["pending", "confirmed", "completed"]);
  return new Set(
    (data ?? [])
      .map((b) => b.lodgify_reservation_id)
      .filter((x): x is string => typeof x === "string")
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function LodgifyTestPage() {
  const today = todayIso();
  const isSupabaseConfigured = hasSupabaseAdminEnv();
  const [propertiesResult, reservationsResult] = await Promise.all([
    fetchProperties(),
    fetchReservations(),
  ]);

  const validReservations = reservationsResult.ok
    ? reservationsResult.reservations
        .filter(
          (r) => r.departureIso >= today && PROPERTY_TO_CABIN[r.propertyId]
        )
        .sort((a, b) => a.arrivalIso.localeCompare(b.arrivalIso))
    : [];

  const usedComplimentary = await fetchUsedComplimentary(
    validReservations.map((r) => r.id)
  );

  const availableCount = isSupabaseConfigured
    ? validReservations.filter((r) => !usedComplimentary.has(r.id)).length
    : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
          Lodgify
        </p>
        <h1 className="mt-2 font-serif text-4xl font-medium leading-[1.05] tracking-tight md:text-5xl">
          Reservations
        </h1>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          Active and upcoming Lodgify bookings across all five cabins, with the
          status of each reservation&apos;s complimentary kayak.
        </p>
      </header>

      <section>
        {!reservationsResult.ok ? (
          <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p>
              <strong>Couldn&apos;t load reservations.</strong>
            </p>
            {reservationsResult.status && (
              <p>HTTP status: {reservationsResult.status}</p>
            )}
            <p className="break-words font-mono text-xs">
              {reservationsResult.error}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-serif text-2xl font-medium tracking-tight">
                Valid bookings ({validReservations.length})
              </h2>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {isSupabaseConfigured
                  ? `${availableCount} complimentary kayak${availableCount === 1 ? "" : "s"} still available`
                  : "Complimentary status needs Supabase"}
              </p>
            </div>

            {validReservations.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-ink-muted)]">
                No upcoming reservations on file.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--color-bg)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">
                    <tr>
                      <th className="px-4 py-3">Reservation #</th>
                      <th className="px-4 py-3">Cabin</th>
                      <th className="px-4 py-3">Guest</th>
                      <th className="px-4 py-3">Arrival</th>
                      <th className="px-4 py-3">Departure</th>
                      <th className="px-4 py-3">Free kayak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validReservations.map((r) => {
                      const cabin =
                        PROPERTY_TO_CABIN[r.propertyId] ?? "Unknown";
                      const used = usedComplimentary.has(r.id);
                      return (
                        <tr
                          key={r.id}
                          className="border-t border-[var(--color-border)] align-top"
                        >
                          <td className="px-4 py-3 font-mono text-xs">
                            {r.id}
                          </td>
                          <td className="px-4 py-3 font-medium">{cabin}</td>
                          <td className="px-4 py-3 text-[var(--color-ink-muted)]">
                            {r.guestName ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {formatDate(r.arrivalIso)}
                          </td>
                          <td className="px-4 py-3">
                            {formatDate(r.departureIso)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                                !isSupabaseConfigured || used
                                  ? "border border-[var(--color-border)] bg-white text-[var(--color-ink-muted)]"
                                  : "bg-[var(--color-accent)] text-white"
                              }`}
                            >
                              {!isSupabaseConfigured
                                ? "Unknown"
                                : used
                                  ? "Used"
                                  : "Available"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-serif text-2xl font-medium tracking-tight">
          Properties
        </h2>
        {!propertiesResult.ok ? (
          <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p>
              <strong>Couldn&apos;t load properties.</strong>
            </p>
            {propertiesResult.status && (
              <p>HTTP status: {propertiesResult.status}</p>
            )}
            <p className="break-words font-mono text-xs">
              {propertiesResult.error}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-bg)] text-left text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Cabin label</th>
                </tr>
              </thead>
              <tbody>
                {propertiesResult.properties.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{p.id}</td>
                    <td className="px-4 py-3 font-medium">
                      {p.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-ink-muted)]">
                      {PROPERTY_TO_CABIN[p.id] ?? "(not mapped)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Link
        href="/admin/kayaks"
        className="inline-block text-sm font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
      >
        ← Back to admin
      </Link>
    </div>
  );
}
