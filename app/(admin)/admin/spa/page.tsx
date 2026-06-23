import Link from "next/link";
import AdminRouteShell from "@/components/AdminRouteShell";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import {
  getSpaMasterHours,
  listRecentBookings,
  listServices,
  listTherapists,
} from "@/lib/spaBookings";
import type {
  MassageBooking,
  MassageService,
  MassageTherapist,
  WeeklyHours,
} from "@/lib/types";
import SpaManager from "./SpaManager";

export const dynamic = "force-dynamic";

export default async function AdminSpaPage() {
  let configured = hasSupabaseAdminEnv();
  let therapists: MassageTherapist[] = [];
  let services: MassageService[] = [];
  let bookings: MassageBooking[] = [];
  let masterHours: WeeklyHours = {};

  if (configured) {
    try {
      [therapists, services, bookings, masterHours] = await Promise.all([
        listTherapists({ includeInactive: true }),
        listServices({ includeInactive: true }),
        listRecentBookings(100),
        getSpaMasterHours(),
      ]);
    } catch (err) {
      // Tables may not exist yet (migration not run) — show the setup notice.
      console.error("Admin spa data load failed:", err);
      configured = false;
    }
  }

  return (
    <AdminRouteShell
      activeCategory="spa"
      activeTitle="In-Cabin Massage"
      contentWidth="wide"
    >
      <header className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
            Customer Portal
          </p>
          <h1 className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
            In-Cabin Massage
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Manage the therapist&apos;s availability, services, and incoming
            booking requests. Guests book and pay in the portal; the therapist
            accepts or declines by text within 30 minutes.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/admin"
            className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Operations
          </Link>
        </div>
      </header>

      {configured ? (
        <SpaManager
          therapists={therapists}
          services={services}
          bookings={bookings}
          masterHours={masterHours}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-sm leading-relaxed text-[var(--color-ink-muted)] md:p-8">
          <p className="font-medium text-[var(--color-ink)]">
            In-cabin massage is installed but Supabase is not connected in this
            environment.
          </p>
          <p className="mt-3">
            Add <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span>,{" "}
            <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>, and{" "}
            <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>, then run
            the migration{" "}
            <span className="font-mono">
              supabase/sql/0019_spa_massage.sql
            </span>
            .
          </p>
        </div>
      )}
    </AdminRouteShell>
  );
}
