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

export default function Header({
  activeTitle,
  lastRun = null,
  lastRunStatus = null,
  showCron = true,
}) {
  const isSuccess = lastRunStatus === "SUCCESS";

  return (
    <header className="w-full px-4 pt-4 md:px-8 md:pt-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between md:px-5">
        <div className="min-w-0">
          <Link href="/admin" className="inline-flex flex-col leading-none">
            <span className="font-serif text-xl font-medium tracking-tight text-[var(--color-ink)]">
              Zenfulcove
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

        <div className="flex flex-wrap items-center gap-2">
          {showCron && (
            <>
              <div className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-ink-muted)]">
                <span className="font-medium text-[var(--color-ink)]">
                  Last cron:
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
