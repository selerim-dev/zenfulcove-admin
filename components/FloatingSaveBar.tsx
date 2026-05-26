"use client";

type FloatingSaveBarProps = {
  visible: boolean;
  saving?: boolean;
  saved?: boolean;
  disabled?: boolean;
  formId?: string;
  onSave?: () => void;
  message?: string;
  saveLabel?: string;
  savingLabel?: string;
  savedLabel?: string;
};

export default function FloatingSaveBar({
  visible,
  saving = false,
  saved = false,
  disabled = false,
  formId,
  onSave,
  message = "Unsaved changes",
  saveLabel = "Save changes",
  savingLabel = "Saving...",
  savedLabel = "Changes saved",
}: FloatingSaveBarProps) {
  if (!visible && !saved) return null;

  const isSavedOnly = saved && !visible && !saving;
  const label = saving ? savingLabel : saveLabel;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur md:px-5 ${
          isSavedOnly
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : "border-[var(--color-border)] bg-[var(--color-ink)] text-white"
        }`}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {isSavedOnly ? savedLabel : message}
          </p>
          {!isSavedOnly ? (
            <p className="mt-0.5 text-xs text-white/70">
              Review your edits before saving.
            </p>
          ) : null}
        </div>

        {!isSavedOnly ? (
          <button
            type={formId ? "submit" : "button"}
            form={formId}
            onClick={formId ? undefined : onSave}
            disabled={saving || disabled}
            className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
