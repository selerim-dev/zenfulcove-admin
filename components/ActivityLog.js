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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-sand p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-xl text-forest">Activity Log</h3>
        <div className="flex items-center gap-3">
          {totalPages > 1 && (
            <span className="text-sm text-forest/60">
              Page {page} of {totalPages}
              {total > 0 && ` (${total} total)`}
            </span>
          )}
          <button
            onClick={() => onRefresh(1)}
            className="border border-grove text-grove hover:bg-grove hover:text-white rounded-full px-4 py-2 text-sm transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <p className="text-center italic text-forest/40 py-8">
          No activity yet.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-forest/60 uppercase text-xs tracking-wider border-b border-sand">
                  <th className="text-left py-3 pr-4">Timestamp</th>
                  <th className="text-left py-3 pr-4">Automation</th>
                  <th className="text-left py-3 pr-4">Property</th>
                  <th className="text-left py-3 pr-4">Action</th>
                  <th className="text-left py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-sand/50 last:border-0"
                  >
                    <td className="py-3 pr-4 text-forest/70 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-forest">{log.automation}</td>
                    <td className="py-3 pr-4 text-forest/80">{log.property}</td>
                    <td className="py-3 pr-4 text-forest/70 max-w-xs truncate">
                      {log.action}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={log.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-sand">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={!canPrev}
                className="border border-sand rounded-full px-4 py-2 text-sm text-forest/70 hover:bg-sand/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Previous
              </button>
              <span className="text-sm text-forest/60">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={!canNext}
                className="border border-sand rounded-full px-4 py-2 text-sm text-forest/70 hover:bg-sand/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
