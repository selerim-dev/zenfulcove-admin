import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import LocalForm from "@/components/customer/LocalForm";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { getLocalFormBySlug } from "@/lib/local-forms";

export const dynamic = "force-dynamic";

type LocalFormSchema = {
  fields?: {
    name: string;
    label?: string;
    type?: string;
    required?: boolean;
    placeholder?: string;
    helpText?: string;
    options?: string[];
    optionSource?: string;
    multiple?: boolean;
  }[];
  subtitle?: string;
  introText?: string;
  termsText?: string;
  submitLabel?: string;
  successMessage?: string;
};

export default async function LocalFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  if (!hasSupabaseAdminEnv()) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="font-serif text-4xl font-medium tracking-tight">
          Form setup needed.
        </h1>
        <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Local forms are installed but not connected in this environment. Add
          the Supabase URL and service-role key, then run the migrations in{" "}
          <span className="font-mono">supabase/sql</span>.
        </p>
      </div>
    );
  }

  const form = await getLocalFormBySlug(slug);
  const cookieStore = await cookies();
  const isAdminPreview =
    query?.preview === "1" && cookieStore.get("zc_admin_auth")?.value === "true";

  if (!form || (form.is_active === false && !isAdminPreview)) notFound();
  const schema = (form.schema || {}) as LocalFormSchema;
  const rawSubtitle = schema.subtitle || form.description || "";
  const subtitle = String(rawSubtitle || "").includes("Jotform")
    ? "Share the details needed for your stay."
    : rawSubtitle;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        {isAdminPreview && form.is_active === false ? (
          <p className="mb-4 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
            Staff Preview - hidden from customers
          </p>
        ) : null}
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
          Zenfulcove Glamping
        </p>
        <h1 className="mt-2 font-serif text-4xl font-medium leading-[1.05] tracking-tight">
          {form.name}
        </h1>
        {subtitle ? (
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            {subtitle}
          </p>
        ) : null}
        {schema.introText ? (
          <p className="mt-4 whitespace-pre-line rounded-xl border border-[var(--color-border)] bg-white p-4 text-sm leading-relaxed text-[var(--color-ink)]">
            {schema.introText}
          </p>
        ) : null}
      </header>

      <LocalForm
        formSlug={form.slug}
        schema={schema}
        staffPreview={isAdminPreview}
      />
    </div>
  );
}
