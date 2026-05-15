export const metadata = {
  title: "Terms · ZenfulCove Kayaks",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
          Terms
        </p>
        <h1 className="mt-2 font-serif text-4xl font-medium leading-[1.05] tracking-tight md:text-5xl">
          Rental terms &amp; waiver
        </h1>
      </header>

      <div className="space-y-3">
        <section className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="font-serif text-lg font-medium tracking-tight">
            What&apos;s included
          </h2>
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Rental includes paddles and life jacket.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="font-serif text-lg font-medium tracking-tight">
            Cancellation policy
          </h2>
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Full refund of Kayaks with 48 hours of notice.
          </p>
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
            No refunds within 24 hours of rentals. Questions? Call us at{" "}
            <a
              href="tel:+15122737962"
              className="font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
            >
              512-273-7962
            </a>
            .
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="font-serif text-lg font-medium tracking-tight">
            Kayak rental agreement clause
          </h2>
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Renter assumes all risks and full responsibility for the use of the
            kayak and releases the Owner from any liability for injury, death,
            or property damage arising from its use, regardless of cause.
            Renter agrees to indemnify and hold the Owner harmless from any
            claims related to their use of the kayak.
          </p>
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Renter agrees to wear life jacket at all times while using the
            kayak and to return the kayak to the designated storage area by
            the end of the rental day.
          </p>
        </section>

        <section className="space-y-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="font-serif text-lg font-medium tracking-tight">
            Contact
          </h2>
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Phone:{" "}
            <a
              href="tel:+15122737962"
              className="font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
            >
              +1 (512) 273-7962
            </a>
          </p>
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Email:{" "}
            <a
              href="mailto:contact@zenfulcove.com"
              className="font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
            >
              contact@zenfulcove.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
