import Link from "next/link";
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
    <div className="mx-auto max-w-5xl space-y-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
            Staff
          </p>
          <h1 className="mt-3 font-serif text-5xl font-medium leading-[1.05] tracking-tight md:text-6xl">
            Kayak Management
          </h1>
        </div>
        <div className="flex items-center gap-2">
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
                Fleet ({kayaks.length})
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
                Recent bookings ({bookings.length})
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
        <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Kayak management is installed but not connected in this environment.
          Add <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
          <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>, then
          run the migrations in <span className="font-mono">supabase/sql</span>.
        </p>
      )}
    </div>
  );
}
