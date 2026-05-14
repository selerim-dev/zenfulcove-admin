"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/book", label: "Book a Kayak" },
  { href: "/fleet", label: "Fleet" },
  { href: "/terms", label: "Terms" },
];

export default function Sidebar({
  open,
  onNavigate,
}: {
  open: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-72 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-transform duration-200 ease-out md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:translate-x-0 md:transition-none ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-full flex-col items-start gap-10 p-6 md:p-8">
        <div className="flex flex-col items-start">
          <h1 className="font-serif text-3xl font-medium leading-none tracking-tight text-[var(--color-accent-strong)]">
            Zenfulcove
          </h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            Kayak Booking
          </p>
        </div>

        <nav className="flex w-full flex-col gap-1">
          {items.map((it) => {
            const active = pathname.startsWith(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={onNavigate}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--color-accent)] text-white shadow-sm"
                    : "text-[var(--color-ink)] hover:bg-[var(--color-bg)]"
                }`}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto w-full space-y-5">
          <div className="border-t border-[var(--color-border)] pt-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
              Contact
            </p>
            <div className="mt-2 space-y-1">
              <a
                href="tel:+15122737962"
                className="block text-xs text-[var(--color-ink)] transition hover:text-[var(--color-accent)]"
              >
                +1 (512) 273-7962
              </a>
              <a
                href="mailto:contact@zenfulcove.com"
                className="block break-all text-xs text-[var(--color-ink)] transition hover:text-[var(--color-accent)]"
              >
                contact@zenfulcove.com
              </a>
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] pt-5">
            <Link
              href="/admin"
              onClick={onNavigate}
              className="block rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-center text-sm font-medium text-[var(--color-ink)] shadow-sm transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Staff Login
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
