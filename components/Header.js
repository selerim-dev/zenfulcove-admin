"use client";

import Link from "next/link";

function formatRunTime(timestamp) {
  if (!timestamp) return "Never";
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * @param {{
 *   activeTitle?: string;
 *   lastRun?: string | null;
 *   lastRunStatus?: string | null;
 *   showCron?: boolean;
 *   onOpenMenu?: (() => void) | null;
 * }} props
 */
export default function Header({
  activeTitle,
  lastRun = null,
  lastRunStatus = null,
  showCron = true,
  onOpenMenu = null,
}) {
  const isSuccess = lastRunStatus === "SUCCESS";

  return (
    <header className="w-full px-4 pt-4 md:px-8 md:pt-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              aria-label="Open menu"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-ink)] md:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-5 w-5"
              >
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </button>
          )}
          <div className="min-w-0">
          <Link href="/admin" className="inline-flex flex-col leading-none">
            <span className="font-serif text-xl font-medium tracking-tight text-[var(--color-ink)]">
              Zenfulcove Glamping
            </span>
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              Staff Operations
            </span>
          </Link>
          {activeTitle && (
            <p className="mt-2 text-sm font-medium text-[var(--color-ink-muted)]">
              {activeTitle}
            </p>
          )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showCron && (
            <>
              <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-ink-muted)]">
                <span className="font-medium text-[var(--color-ink)]">
                  Last run:
                </span>{" "}
                {formatRunTime(lastRun)}
              </div>
              {lastRunStatus && (
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold text-white ${
                    isSuccess ? "bg-[var(--color-accent)]" : "bg-red-500"
                  }`}
                >
                  {lastRunStatus}
                </span>
              )}
            </>
          )}
          <Link
            href="/"
            className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Customer site
          </Link>
        </div>
      </div>
    </header>
  );
}
