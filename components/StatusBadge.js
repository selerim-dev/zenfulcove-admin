"use client";

export default function StatusBadge({ status }) {
  if (status === "success" || status === "skipped") {
    return (
      <span className="inline-flex items-center rounded-full bg-grove/10 px-2.5 py-0.5 text-xs font-medium text-grove">
        {status === "success" ? "SUCCESS" : "SKIPPED"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">
      FAILED
    </span>
  );
}
