import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { hasSupabaseClientEnv } from "@/lib/supabaseEnv";
import { formatMoney, type Kayak } from "@/lib/types";
import { formatLongDate, todayIso } from "@/lib/dates";
import { notFound } from "next/navigation";
import BookingForm from "./BookingForm";
import KayakIllustration from "@/components/customer/KayakIllustration";

export const dynamic = "force-dynamic";

export default async function KayakBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ kayakId: string }>;
  searchParams: Promise<{
    date?: string;
    reservation?: string;
    lastName?: string;
  }>;
}) {
  const { kayakId } = await params;
  const { date, reservation = "", lastName = "" } = await searchParams;
  const dateIso =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayIso();

  if (!hasSupabaseClientEnv()) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-sm leading-relaxed text-[var(--color-ink-muted)]">
        Kayak booking is installed but not connected in this environment. Add
        the Supabase URL and anon key, then run the migrations in{" "}
        <span className="font-mono">supabase/sql</span>.
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("kayaks")
    .select("*")
    .eq("id", kayakId)
    .eq("is_active", true)
    .maybeSingle();

  const kayak = data as Kayak | null;
  if (!kayak) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink)]">
          {formatLongDate(dateIso)}
        </p>
        <h1 className="mt-2 font-serif text-3xl font-medium leading-[1.05] tracking-tight md:text-4xl">
          Almost there.
        </h1>
      </div>
      <header className="flex items-center gap-4 rounded-2xl bg-[var(--color-bg)] p-4">
        <KayakIllustration
          color={kayak.color}
          capacity={kayak.capacity}
          className="h-12 w-auto shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-lg font-medium tracking-tight">
            {kayak.name}
          </p>
          <p className="text-xs text-[var(--color-ink-muted)]">
            {kayak.capacity === 1 ? "Solo" : `${kayak.capacity}-seat`}
            {kayak.length_feet ? ` · ${kayak.length_feet} ft` : ""}
          </p>
        </div>
        <p className="text-sm font-medium text-[var(--color-accent-strong)]">
          {formatMoney(kayak.daily_rate_cents)}/day
        </p>
      </header>
      <BookingForm
        kayak={kayak}
        dateIso={dateIso}
        initialReservation={reservation}
        initialLastName={lastName}
      />
    </div>
  );
}
