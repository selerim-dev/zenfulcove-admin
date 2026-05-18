import AdminRouteShell from "@/components/AdminRouteShell";
import { signLocalFormUpload } from "@/lib/local-forms";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import FormsManager, {
  type LocalFormRow,
  type LocalFormSubmissionRow,
  type LocalFormStats,
} from "./FormsManager";

export const dynamic = "force-dynamic";

type SubmissionRow = {
  id?: string;
  form_slug: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  booking_code?: string | null;
  payload?: Record<string, unknown> | null;
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

async function signSubmissionFiles(row: SubmissionRow) {
  const payload =
    row.payload && typeof row.payload === "object" ? row.payload : {};
  const rawFiles = Array.isArray(
    (payload as { __files?: unknown }).__files
  )
    ? ((payload as { __files: Record<string, unknown>[] }).__files || [])
    : [];
  const signedFiles = await Promise.all(
    rawFiles.map((file) => signLocalFormUpload(file))
  );

  return {
    id: String(row.id || ""),
    form_slug: String(row.form_slug || ""),
    email: row.email || null,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    phone: row.phone || null,
    booking_code: row.booking_code || null,
    sendgrid_synced_at: row.sendgrid_synced_at || null,
    submitted_at: row.submitted_at || "",
    payload: {
      ...payload,
      __files: signedFiles,
    },
  } as LocalFormSubmissionRow;
}

function groupSubmissions(rows: LocalFormSubmissionRow[]) {
  const grouped: Record<string, LocalFormSubmissionRow[]> = {};
  for (const row of rows) {
    if (!row.form_slug) continue;
    if (!grouped[row.form_slug]) grouped[row.form_slug] = [];
    grouped[row.form_slug].push(row);
  }
  return grouped;
}

export default async function AdminFormsPage() {
  const isSupabaseConfigured = hasSupabaseAdminEnv();
  let forms: LocalFormRow[] = [];
  let stats: Record<string, LocalFormStats> = {};
  let submissionsBySlug: Record<string, LocalFormSubmissionRow[]> = {};
  let errorMessage = "";

  if (isSupabaseConfigured) {
    const supabase = createSupabaseAdminClient();
    const [formsResp, statsResp, recentResp] = await Promise.all([
      supabase
        .from("local_forms")
        .select(
          "id, slug, name, description, schema, is_active, created_at, updated_at"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("local_form_submissions")
        .select("form_slug, sendgrid_synced_at, submitted_at"),
      supabase
        .from("local_form_submissions")
        .select(
          "id, form_slug, email, first_name, last_name, phone, booking_code, payload, sendgrid_synced_at, submitted_at"
        )
        .order("submitted_at", { ascending: false })
        .limit(5000),
    ]);

    if (formsResp.error) {
      errorMessage = formsResp.error.message;
    } else if (statsResp.error) {
      errorMessage = statsResp.error.message;
      forms = (formsResp.data ?? []) as LocalFormRow[];
    } else if (recentResp.error) {
      errorMessage = recentResp.error.message;
      forms = (formsResp.data ?? []) as LocalFormRow[];
    } else {
      forms = (formsResp.data ?? []) as LocalFormRow[];
      stats = buildStats((statsResp.data ?? []) as SubmissionRow[]);
      const submissionRows = (recentResp.data ?? []) as SubmissionRow[];
      submissionsBySlug = groupSubmissions(
        await Promise.all(submissionRows.map((row) => signSubmissionFiles(row)))
      );
    }
  }

  return (
    <AdminRouteShell
      activeCategory="forms"
      activeTitle="Forms"
      contentWidth="wide"
    >
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
        <FormsManager
          forms={forms}
          stats={stats}
          submissionsBySlug={submissionsBySlug}
        />
      )}
    </AdminRouteShell>
  );
}
