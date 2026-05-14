"use client";

import StatusBadge from "./StatusBadge";

export default function ActivityLog({
  logs,
  page,
  totalPages,
  total,
  onPageChange,
  onRefresh,
}) {
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const visibleLogs = logs.slice(0, 10);

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm md:p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-serif text-2xl font-medium tracking-tight text-[var(--color-ink)]">
            Activity Log
          </h3>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Showing 10 events per page
            {total > 0 && ` from ${total} total`}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-muted)]">
            Page {page} of {Math.max(totalPages, 1)}
          </span>
          <button
            onClick={() => onRefresh(1)}
            className="rounded-full border border-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent)] transition hover:bg-[var(--color-accent)] hover:text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {visibleLogs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] py-8 text-center text-sm italic text-[var(--color-ink-muted)]">
          No activity yet.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {visibleLogs.map((log, idx) => (
              <article
                key={`${log.timestamp}-${idx}`}
                className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-white px-3 py-3 md:grid-cols-[minmax(150px,190px)_minmax(0,1fr)_auto] md:items-center"
              >
                <div className="text-xs font-medium text-[var(--color-ink-muted)]">
                  {new Date(log.timestamp).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="font-medium text-[var(--color-ink)]">
                      {log.automation || "Automation"}
                    </p>
                    {log.property && (
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                        {log.property}
                      </p>
                    )}
                  </div>
                  <p className="mt-1 break-words text-sm leading-relaxed text-[var(--color-ink-muted)]">
                    {log.action || "No action recorded."}
                  </p>
                </div>
                <div className="justify-self-start md:justify-self-end">
                  <StatusBadge status={log.status} />
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={!canPrev}
                className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-ink-muted)] transition hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Newer
              </button>
              <span className="text-sm text-[var(--color-ink-muted)]">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={!canNext}
                className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-ink-muted)] transition hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Older
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
