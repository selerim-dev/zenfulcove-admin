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
  }[];
  submitLabel?: string;
  successMessage?: string;
};

export default async function LocalFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

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
  if (!form || form.is_active === false) notFound();
  const description = String(form.description || "").includes("Jotform")
    ? "Share the details needed for your stay."
    : form.description;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
          Zenfulcove
        </p>
        <h1 className="mt-2 font-serif text-4xl font-medium leading-[1.05] tracking-tight">
          {form.name}
        </h1>
        {description ? (
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            {description}
          </p>
        ) : null}
      </header>

      <LocalForm formSlug={form.slug} schema={(form.schema || {}) as LocalFormSchema} />
    </div>
  );
}
