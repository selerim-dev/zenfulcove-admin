"use client";

import { useState } from "react";
import ColorPicker from "@/components/customer/ColorPicker";
import { createKayak, deleteKayak, updateKayak } from "./actions";
import type { Kayak } from "@/lib/types";

export default function KayakForm({
  kayak,
  onSuccess,
}: {
  kayak?: Kayak;
  onSuccess: () => void;
}) {
  const isEdit = Boolean(kayak);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const file = formData.get("image");
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) {
        setError("Photo must be an image file.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Photo must be under 5MB.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await updateKayak(formData);
      } else {
        await createKayak(formData);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!kayak) return;
    if (
      !window.confirm(`Delete ${kayak.name}? This can't be undone.`)
    ) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await deleteKayak(kayak.id);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      {isEdit && kayak && (
        <input type="hidden" name="id" value={kayak.id} />
      )}

      <Field label="Name">
        <input
          name="name"
          type="text"
          required
          defaultValue={kayak?.name ?? ""}
        placeholder="e.g. Rental #10"
          className="form-input"
        />
      </Field>
      <Field label="Access Code">
        <input
          name="code"
          type="text"
          required
          defaultValue={kayak?.code ?? ""}
          placeholder="e.g. 3820"
          className="form-input"
        />
      </Field>
      <Field label="Capacity (paddlers)">
        <input
          name="capacity"
          type="number"
          min={1}
          max={6}
          required
          defaultValue={kayak?.capacity ?? 1}
          className="form-input"
        />
      </Field>
      <Field label="Length (feet)">
        <input
          name="length_feet"
          type="number"
          min={1}
          max={30}
          required
          defaultValue={kayak?.length_feet ?? 10}
          className="form-input"
        />
      </Field>
      <Field label="Daily rate (USD)">
        <input
          name="daily_rate"
          type="number"
          step="0.01"
          min={0}
          required
          defaultValue={
            kayak ? (kayak.daily_rate_cents / 100).toFixed(2) : "80"
          }
          className="form-input"
        />
      </Field>
      <Field label="Color">
        <ColorPicker name="color" defaultValue={kayak?.color ?? "#2563eb"} />
      </Field>

      <Field label="Photo" full>
        {kayak?.image_url && (
          <div className="mb-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={kayak.image_url}
              alt={kayak.name}
              className="h-16 w-16 rounded-lg object-cover ring-1 ring-[var(--color-border)]"
            />
            <span className="text-xs text-[var(--color-ink-muted)]">
              Current photo. Pick a new file to replace it.
            </span>
          </div>
        )}
        <input
          name="image"
          type="file"
          accept="image/*"
          className="block w-full cursor-pointer text-sm text-[var(--color-ink)] file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-[var(--color-border)] file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--color-ink)] file:transition hover:file:border-[var(--color-accent)]"
        />
        <span className="block text-[11px] text-[var(--color-ink-muted)]">
          JPG or PNG, up to 5MB. Square images crop best.
        </span>
      </Field>

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          name="is_active"
          type="checkbox"
          defaultChecked={kayak?.is_active ?? true}
          className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
        />
        Active (visible to public)
      </label>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 sm:col-span-2">
        {isEdit ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)] disabled:opacity-60"
        >
          {submitting
            ? "Saving…"
            : isEdit
              ? "Save changes"
              : "Add rental"}
        </button>
      </div>

      <style>{`
        .form-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--color-border);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .form-input:focus {
          outline: 2px solid var(--color-accent);
          outline-offset: 1px;
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block space-y-1 ${full ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs font-medium text-[var(--color-ink-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
