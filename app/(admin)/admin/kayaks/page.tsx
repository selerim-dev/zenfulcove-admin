import Link from "next/link";
import AdminRouteShell from "@/components/AdminRouteShell";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { type Booking, type Kayak } from "@/lib/types";
import FleetManager from "./FleetManager";
import BookingsTable from "./BookingsTable";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const isSupabaseConfigured = hasSupabaseAdminEnv();
  let kayaks: Kayak[] = [];
  let bookings: Booking[] = [];

  if (isSupabaseConfigured) {
    const supabase = createSupabaseAdminClient();

    const [kayaksResp, bookingsResp] = await Promise.all([
      supabase
        .from("kayaks")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("bookings")
        .select("*")
        .order("starts_at", { ascending: false })
        .limit(50),
    ]);

    kayaks = (kayaksResp.data ?? []) as Kayak[];
    bookings = (bookingsResp.data ?? []) as Booking[];
  }

  return (
    <AdminRouteShell activeCategory="kayaks" activeTitle="Rental Management">
      <header className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
            Staff
          </p>
          <h1 className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
            Rental Management
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Manage customer portal inventory, booking records, and Lodgify
            reservation checks from the staff workspace.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/admin/kayaks/lodgify"
            className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Lodgify
          </Link>
          <Link
            href="/admin"
            className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Operations
          </Link>
        </div>
      </header>

      {isSupabaseConfigured ? (
        <>
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-serif text-2xl font-medium tracking-tight">
                Inventory ({kayaks.length})
              </h2>
              <p className="text-sm text-[var(--color-ink-muted)]">
                Click a card to edit.
              </p>
            </div>
            <FleetManager kayaks={kayaks} />
          </section>

          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-serif text-2xl font-medium tracking-tight">
                Recent reservations ({bookings.length})
              </h2>
              {bookings.length > 0 && (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Click a row to view or delete.
                </p>
              )}
            </div>
            <BookingsTable bookings={bookings} kayaks={kayaks} />
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-sm leading-relaxed text-[var(--color-ink-muted)] md:p-8">
          <p className="font-medium text-[var(--color-ink)]">
            Rental management is installed but Supabase is not connected in this
            environment.
          </p>
          <p className="mt-3">
            Add the Supabase Project URL as{" "}
            <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span>, the
            Publishable key as{" "}
            <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>,
            and the Secret/service role key as{" "}
            <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>.
          </p>
          <p className="mt-3">
            For a fresh database, run the single SQL file at{" "}
            <span className="font-mono">supabase/zenfulcove_full_schema.sql</span>.
          </p>
        </div>
      )}
    </AdminRouteShell>
  );
}
