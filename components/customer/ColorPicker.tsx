"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COLOR_OPTIONS, colorLabel } from "@/lib/types";

export default function ColorPicker({
  name,
  defaultValue = "#2563eb",
  onValueChange,
}: {
  name: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: rect.left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm transition hover:border-[var(--color-accent)]"
      >
        <span
          className="h-5 w-5 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: value }}
        />
        <span className="text-[var(--color-ink-muted)]">
          {colorLabel(value)}
        </span>
        <span className="text-[var(--color-ink-muted)]">▾</span>
      </button>
      {typeof document !== "undefined" &&
        open &&
        createPortal(
          <div
            ref={popupRef}
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-[60] grid w-max min-w-[15rem] grid-cols-4 gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-lg"
          >
            {COLOR_OPTIONS.map((c) => {
              const isSelected = value === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => {
                    setValue(c.value);
                    onValueChange?.(c.value);
                    setOpen(false);
                  }}
                  className={`h-9 w-9 rounded-full ring-1 ring-black/10 transition ${
                    isSelected
                      ? "scale-110 ring-2 ring-[var(--color-accent)]"
                      : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c.value }}
                  aria-label={c.label}
                  title={c.label}
                />
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
