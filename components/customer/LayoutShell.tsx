"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Sidebar from "./Sidebar";

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [open, setOpen] = useState(false);

  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <div className="md:flex md:min-h-screen">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 md:hidden">
        <Link href="/" className="flex flex-col leading-none">
          <span className="font-serif text-xl font-medium tracking-tight text-[var(--color-accent-strong)]">
            Zenfulcove
          </span>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            Kayak Booking
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="h-5 w-5"
          >
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar open={open} onNavigate={() => setOpen(false)} />

      <main className="min-w-0 flex-1 px-5 py-6 md:px-12 md:py-14">
        {children}
      </main>
    </div>
  );
}
