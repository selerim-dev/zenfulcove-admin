"use client";

import { useEffect } from "react";

export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <header className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
            <h2 className="font-serif text-xl font-medium tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[var(--color-ink-muted)] transition hover:bg-[var(--color-bg)]"
              aria-label="Close"
            >
              ×
            </button>
          </header>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[var(--color-ink-muted)] transition hover:bg-[var(--color-bg)]"
            aria-label="Close"
          >
            ×
          </button>
        )}
        <div className="max-h-[85vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
