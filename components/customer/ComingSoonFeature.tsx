import Link from "next/link";

const CONTACT_EMAIL = "contact@zenfulcove.com";

export default function ComingSoonFeature({
  eyebrow,
  title,
  note,
}: {
  eyebrow: string;
  title: string;
  note: string;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-white shadow-sm">
        <div
          className="min-h-[420px] bg-cover bg-center"
          style={{ backgroundImage: "url(/landing.jpg)" }}
        >
          <div className="flex min-h-[420px] flex-col justify-end bg-black/35 p-6 text-white md:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/85">
              {eyebrow}
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-5xl font-medium leading-[1.02] tracking-tight md:text-6xl">
              Coming soon.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/90 md:text-base">
              {note}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[var(--color-border)] bg-white p-6 shadow-sm md:p-8">
        <div className="max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Not quite ready yet
          </p>
          <h2 className="mt-2 font-serif text-3xl font-medium tracking-tight text-[var(--color-ink)]">
            {title}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            We are putting the finishing touches on this part of the guest
            portal. If you have questions before it goes live, reach out and we
            will help you directly.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex rounded-full bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
            >
              Email Zenfulcove
            </a>
            <Link
              href="/book"
              className="inline-flex rounded-full border border-[var(--color-border)] bg-white px-5 py-3 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Back to My Stay
            </Link>
          </div>
          <p className="mt-4 text-xs text-[var(--color-ink-muted)]">
            {CONTACT_EMAIL}
          </p>
        </div>
      </section>
    </div>
  );
}
