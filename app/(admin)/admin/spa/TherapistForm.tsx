"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import FloatingSaveBar from "@/components/FloatingSaveBar";
import {
  createTherapistAction,
  deleteTherapistAction,
  updateTherapistAction,
} from "./actions";
import type { MassageTherapist } from "@/lib/types";

function therapistSnapshot(t?: MassageTherapist) {
  return JSON.stringify({
    name: t?.name ?? "",
    phone: t?.phone ?? "",
    google_calendar_id: t?.google_calendar_id ?? "",
    timezone: t?.timezone ?? "America/Chicago",
    slot_interval_min: String(t?.slot_interval_min ?? 30),
    buffer_min: String(t?.buffer_min ?? 30),
    lead_time_hours: String(t?.lead_time_hours ?? 12),
    is_active: t?.is_active ?? true,
  });
}

function formSnapshot(form: HTMLFormElement) {
  const fd = new FormData(form);
  return JSON.stringify({
    name: String(fd.get("name") ?? ""),
    phone: String(fd.get("phone") ?? ""),
    google_calendar_id: String(fd.get("google_calendar_id") ?? ""),
    timezone: String(fd.get("timezone") ?? ""),
    slot_interval_min: String(fd.get("slot_interval_min") ?? ""),
    buffer_min: String(fd.get("buffer_min") ?? ""),
    lead_time_hours: String(fd.get("lead_time_hours") ?? ""),
    is_active: fd.get("is_active") === "on",
  });
}

export default function TherapistForm({
  therapist,
  onSuccess,
}: {
  therapist?: MassageTherapist;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(therapist);
  const formId = therapist
    ? `therapist-form-${therapist.id}`
    : "therapist-form-create";
  const initialSnapshot = useMemo(() => therapistSnapshot(therapist), [therapist]);
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

  function syncDirtyState(form: HTMLFormElement) {
    setSavedRecently(false);
    setIsDirty(!isEdit || formSnapshot(form) !== savedSnapshot);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateTherapistAction(formData);
      } else {
        await createTherapistAction(formData);
      }
      setSavedSnapshot(formSnapshot(form));
      setIsDirty(false);
      setSavedRecently(true);
      router.refresh();
      window.setTimeout(onSuccess, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!therapist) return;
    if (
      !window.confirm(
        `Remove ${therapist.name}? (Not possible if they have bookings — set them to not accepting instead.)`
      )
    ) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await deleteTherapistAction(therapist.id);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      onChange={(event) => syncDirtyState(event.currentTarget)}
      className="grid gap-4 sm:grid-cols-2"
    >
      {isEdit && therapist && (
        <input type="hidden" name="id" value={therapist.id} />
      )}

      <Field label="Name">
        <input
          name="name"
          type="text"
          required
          defaultValue={therapist?.name ?? ""}
          placeholder="e.g. Bodywork by Beth"
          className="form-input"
        />
      </Field>
      <Field label="Mobile number (for booking texts)">
        <input
          name="phone"
          type="tel"
          defaultValue={therapist?.phone ?? ""}
          placeholder="+15125551234"
          className="form-input"
        />
      </Field>
      <Field label="Google Calendar ID" full>
        <input
          name="google_calendar_id"
          type="text"
          defaultValue={therapist?.google_calendar_id ?? ""}
          placeholder="therapist@gmail.com"
          className="form-input font-mono"
        />
        <span className="block text-[11px] text-[var(--color-ink-muted)]">
          The calendar they share with our service account. We read its busy
          times and add confirmed appointments to it.
        </span>
      </Field>
      <Field label="Timezone">
        <input
          name="timezone"
          type="text"
          defaultValue={therapist?.timezone ?? "America/Chicago"}
          className="form-input"
        />
      </Field>
      <Field label="Slot interval (min)">
        <input
          name="slot_interval_min"
          type="number"
          min={5}
          max={240}
          defaultValue={therapist?.slot_interval_min ?? 30}
          className="form-input"
        />
      </Field>
      <Field label="Buffer between appts (min)">
        <input
          name="buffer_min"
          type="number"
          min={0}
          defaultValue={therapist?.buffer_min ?? 30}
          className="form-input"
        />
      </Field>
      <Field label="Lead time (hours)">
        <input
          name="lead_time_hours"
          type="number"
          min={0}
          defaultValue={therapist?.lead_time_hours ?? 12}
          className="form-input"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          name="is_active"
          type="checkbox"
          defaultChecked={therapist?.is_active ?? true}
          className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
        />
        Accepting bookings
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
            Remove
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
        saveLabel={isEdit ? "Save changes" : "Add therapist"}
        savingLabel={isEdit ? "Saving..." : "Adding..."}
        message={isEdit ? "Unsaved therapist changes" : "New therapist"}
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
