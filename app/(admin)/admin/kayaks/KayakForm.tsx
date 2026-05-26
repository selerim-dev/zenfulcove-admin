"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FloatingSaveBar from "@/components/FloatingSaveBar";
import ColorPicker from "@/components/customer/ColorPicker";
import { createKayak, deleteKayak, updateKayak } from "./actions";
import type { Kayak } from "@/lib/types";

function kayakSnapshot(kayak?: Kayak) {
  return JSON.stringify({
    name: kayak?.name ?? "",
    code: kayak?.code ?? "",
    capacity: String(kayak?.capacity ?? 1),
    length_feet: String(kayak?.length_feet ?? 10),
    daily_rate: kayak ? (kayak.daily_rate_cents / 100).toFixed(2) : "80",
    stripe_product_id: kayak?.stripe_product_id ?? "",
    color: kayak?.color ?? "#2563eb",
    is_active: kayak?.is_active ?? true,
    image: "",
  });
}

function formSnapshot(form: HTMLFormElement, colorOverride?: string) {
  const formData = new FormData(form);
  const image = formData.get("image");
  return JSON.stringify({
    name: String(formData.get("name") ?? ""),
    code: String(formData.get("code") ?? ""),
    capacity: String(formData.get("capacity") ?? ""),
    length_feet: String(formData.get("length_feet") ?? ""),
    daily_rate: String(formData.get("daily_rate") ?? ""),
    stripe_product_id: String(formData.get("stripe_product_id") ?? ""),
    color: colorOverride ?? String(formData.get("color") ?? ""),
    is_active: formData.get("is_active") === "on",
    image: image instanceof File && image.size > 0 ? image.name : "",
  });
}

export default function KayakForm({
  kayak,
  onSuccess,
}: {
  kayak?: Kayak;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(kayak);
  const formRef = useRef<HTMLFormElement>(null);
  const formId = kayak ? `kayak-form-${kayak.id}` : "kayak-form-create";
  const initialSnapshot = useMemo(() => kayakSnapshot(kayak), [kayak]);
  const [savedSnapshot, setSavedSnapshot] = useState(initialSnapshot);
  const [isDirty, setIsDirty] = useState(!isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSavedSnapshot(initialSnapshot);
    setIsDirty(!isEdit);
    setSavedRecently(false);
  }, [initialSnapshot, isEdit]);

  function syncDirtyState(form: HTMLFormElement, colorOverride?: string) {
    setSavedRecently(false);
    setIsDirty(!isEdit || formSnapshot(form, colorOverride) !== savedSnapshot);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
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
      setSavedSnapshot(formSnapshot(form));
      setIsDirty(false);
      setSavedRecently(true);
      router.refresh();
      window.setTimeout(onSuccess, 750);
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
    <form
      ref={formRef}
      id={formId}
      onSubmit={handleSubmit}
      onChange={(event) => syncDirtyState(event.currentTarget)}
      className="grid gap-4 sm:grid-cols-2"
    >
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
      <Field label="Stripe Product ID">
        <input
          name="stripe_product_id"
          type="text"
          defaultValue={kayak?.stripe_product_id ?? ""}
          placeholder="prod_..."
          className="form-input font-mono"
        />
      </Field>
      <Field label="Color">
        <ColorPicker
          name="color"
          defaultValue={kayak?.color ?? "#2563eb"}
          onValueChange={(value) => {
            if (formRef.current) syncDirtyState(formRef.current, value);
          }}
        />
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
      </div>

      <FloatingSaveBar
        visible={isDirty || submitting}
        saved={savedRecently}
        saving={submitting}
        formId={formId}
        saveLabel={isEdit ? "Save changes" : "Add rental"}
        savingLabel={isEdit ? "Saving..." : "Adding..."}
        message={isEdit ? "Unsaved rental changes" : "New rental draft"}
      />

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
