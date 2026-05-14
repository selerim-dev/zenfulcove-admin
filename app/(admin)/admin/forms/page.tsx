import AdminRouteShell from "@/components/AdminRouteShell";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import FormsManager, {
  type LocalFormRow,
  type LocalFormStats,
} from "./FormsManager";

export const dynamic = "force-dynamic";

type SubmissionRow = {
  form_slug: string | null;
  sendgrid_synced_at: string | null;
  submitted_at: string | null;
};

function buildStats(rows: SubmissionRow[] | null) {
  const stats: Record<string, LocalFormStats> = {};

  for (const row of rows || []) {
    const slug = String(row.form_slug || "").trim();
    if (!slug) continue;
    if (!stats[slug]) {
      stats[slug] = {
        submissions: 0,
        unsynced: 0,
        lastSubmittedAt: null,
      };
    }

    stats[slug].submissions += 1;
    if (!row.sendgrid_synced_at) stats[slug].unsynced += 1;
    if (
      row.submitted_at &&
      (!stats[slug].lastSubmittedAt ||
        row.submitted_at > stats[slug].lastSubmittedAt)
    ) {
      stats[slug].lastSubmittedAt = row.submitted_at;
    }
  }

  return stats;
}

export default async function AdminFormsPage() {
  const isSupabaseConfigured = hasSupabaseAdminEnv();
  let forms: LocalFormRow[] = [];
  let stats: Record<string, LocalFormStats> = {};
  let errorMessage = "";

  if (isSupabaseConfigured) {
    const supabase = createSupabaseAdminClient();
    const [formsResp, submissionsResp] = await Promise.all([
      supabase
        .from("local_forms")
        .select(
          "id, slug, name, description, schema, is_active, created_at, updated_at"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("local_form_submissions")
        .select("form_slug, sendgrid_synced_at, submitted_at"),
    ]);

    if (formsResp.error) {
      errorMessage = formsResp.error.message;
    } else if (submissionsResp.error) {
      errorMessage = submissionsResp.error.message;
      forms = (formsResp.data ?? []) as LocalFormRow[];
    } else {
      forms = (formsResp.data ?? []) as LocalFormRow[];
      stats = buildStats((submissionsResp.data ?? []) as SubmissionRow[]);
    }
  }

  return (
    <AdminRouteShell activeCategory="forms" activeTitle="Forms">
      <header className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
          Customer Portal
        </p>
        <h1 className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
          Form Management
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Build and publish local customer forms. Submissions are saved in
          Supabase and can sync into SendGrid from the Syncs panel.
        </p>
      </header>

      {!isSupabaseConfigured ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-sm leading-relaxed text-[var(--color-ink-muted)] md:p-8">
          <p className="font-medium text-[var(--color-ink)]">
            Forms are installed but Supabase is not connected in this
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
        </div>
      ) : errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
          <p className="font-semibold">Could not load forms.</p>
          <p className="mt-2 font-mono text-xs">{errorMessage}</p>
        </div>
      ) : (
        <FormsManager forms={forms} stats={stats} />
      )}
    </AdminRouteShell>
  );
}
