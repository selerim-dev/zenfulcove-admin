"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { archiveLocalForm, saveLocalForm } from "./actions";

type LocalFormField = {
  name: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
};

type LocalFormSchema = {
  fields?: LocalFormField[];
  submitLabel?: string;
  successMessage?: string;
};

export type LocalFormRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  schema: LocalFormSchema | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LocalFormStats = {
  submissions: number;
  unsynced: number;
  lastSubmittedAt: string | null;
};

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; form: LocalFormRow };

const DEFAULT_FIELDS: LocalFormField[] = [
  { name: "firstName", label: "First Name", type: "text", required: true },
  { name: "lastName", label: "Last Name", type: "text", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "phone", label: "Phone", type: "tel", required: false },
  { name: "bookingCode", label: "Booking Code", type: "text", required: false },
];

function formatDate(value: string | null) {
  if (!value) return "No submissions";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fieldsFrom(form?: LocalFormRow) {
  const fields = form?.schema?.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    return DEFAULT_FIELDS;
  }
  return fields.map((field) => ({
    name: String(field.name || ""),
    label: String(field.label || ""),
    type: String(field.type || "text"),
    required: Boolean(field.required),
    placeholder: String(field.placeholder || ""),
  }));
}

export default function FormsManager({
  forms,
  stats,
}: {
  forms: LocalFormRow[];
  stats: Record<string, LocalFormStats>;
}) {
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-medium tracking-tight">
            Forms
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Create customer-facing forms and review submission activity.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ mode: "create" })}
          className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-strong)]"
        >
          Create Form
        </button>
      </div>

      {forms.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditor({ mode: "create" })}
          className="w-full rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          No forms yet. Create the first customer form.
        </button>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {forms.map((form) => {
            const formStats = stats[form.slug] || {
              submissions: 0,
              unsynced: 0,
              lastSubmittedAt: null,
            };
            return (
              <article
                key={form.id}
                className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setEditor({ mode: "edit", form })}
                    className="min-w-0 text-left"
                  >
                    <p className="truncate font-serif text-xl font-medium tracking-tight">
                      {form.name}
                    </p>
                    <p className="mt-1 font-mono text-xs text-[var(--color-ink-muted)]">
                      /forms/{form.slug}
                    </p>
                  </button>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                      form.is_active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {form.is_active ? "Active" : "Hidden"}
                  </span>
                </div>

                {form.description ? (
                  <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                    {form.description}
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <Metric label="Submissions" value={formStats.submissions} />
                  <Metric label="Unsynced" value={formStats.unsynced} />
                  <Metric
                    label="Latest"
                    value={formatDate(formStats.lastSubmittedAt)}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEditor({ mode: "edit", form })}
                    className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  >
                    Edit
                  </button>
                  <Link
                    href={`/forms/${form.slug}`}
                    className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  >
                    Open
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editor.mode !== "closed" ? (
        <FormEditor
          key={editor.mode === "edit" ? editor.form.id : "create"}
          form={editor.mode === "edit" ? editor.form : undefined}
          onClose={() => setEditor({ mode: "closed" })}
        />
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--color-ink)]">
        {value}
      </p>
    </div>
  );
}

function FormEditor({
  form,
  onClose,
}: {
  form?: LocalFormRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(form);
  const initialSchema: LocalFormSchema = form?.schema || {};
  const [fields, setFields] = useState<LocalFormField[]>(() =>
    fieldsFrom(form)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeFields = useMemo(
    () =>
      fields.map((field) => ({
        ...field,
        type: field.type || "text",
      })),
    [fields]
  );

  function updateField(
    index: number,
    patch: Partial<LocalFormField>
  ) {
    setFields((current) =>
      current.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field
      )
    );
  }

  function addField() {
    setFields((current) => [
      ...current,
      { name: "", label: "", type: "text", required: false, placeholder: "" },
    ]);
  }

  function removeField(index: number) {
    setFields((current) =>
      current.filter((_, fieldIndex) => fieldIndex !== index)
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await saveLocalForm(new FormData(event.currentTarget));
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    if (!form) return;
    if (!window.confirm(`Hide ${form.name}? Customers will no longer see it.`)) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await archiveLocalForm(form.id);
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
            {isEdit ? "Edit Form" : "New Form"}
          </p>
          <h3 className="mt-1 font-serif text-2xl font-medium tracking-tight">
            {isEdit ? form?.name : "Create a customer form"}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {form ? <input type="hidden" name="id" value={form.id} /> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Form Name">
            <input
              name="name"
              type="text"
              required
              defaultValue={form?.name || ""}
              className="form-input"
            />
          </Field>
          <Field label="Slug">
            <input
              name="slug"
              type="text"
              defaultValue={form?.slug || ""}
              placeholder="guest-info"
              className="form-input"
            />
          </Field>
          <Field label="Description" full>
            <textarea
              name="description"
              defaultValue={form?.description || ""}
              rows={3}
              className="form-input resize-y"
            />
          </Field>
          <Field label="Submit Button">
            <input
              name="submit_label"
              type="text"
              defaultValue={initialSchema.submitLabel || "Submit"}
              className="form-input"
            />
          </Field>
          <Field label="Success Message">
            <input
              name="success_message"
              type="text"
              defaultValue={
                initialSchema.successMessage ||
                "Thanks. We received your information."
              }
              className="form-input"
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            name="is_active"
            type="checkbox"
            defaultChecked={form?.is_active ?? true}
            className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
          />
          Active
        </label>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-[var(--color-ink)]">
              Fields
            </h4>
            <button
              type="button"
              onClick={addField}
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Add Field
            </button>
          </div>

          <input type="hidden" name="field_count" value={activeFields.length} />
          <div className="space-y-3">
            {activeFields.map((field, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 md:grid-cols-[1fr_1fr_120px_auto]"
              >
                <Field label="Name">
                  <input
                    name={`field_name_${index}`}
                    type="text"
                    value={field.name || ""}
                    onChange={(event) =>
                      updateField(index, { name: event.target.value })
                    }
                    className="form-input bg-white"
                  />
                </Field>
                <Field label="Label">
                  <input
                    name={`field_label_${index}`}
                    type="text"
                    value={field.label || ""}
                    onChange={(event) =>
                      updateField(index, { label: event.target.value })
                    }
                    className="form-input bg-white"
                  />
                </Field>
                <Field label="Type">
                  <select
                    name={`field_type_${index}`}
                    value={field.type || "text"}
                    onChange={(event) =>
                      updateField(index, { type: event.target.value })
                    }
                    className="form-input bg-white"
                  >
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="tel">Phone</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                  </select>
                </Field>
                <div className="flex items-end gap-2">
                  <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-medium">
                    <input
                      name={`field_required_${index}`}
                      type="checkbox"
                      checked={Boolean(field.required)}
                      onChange={(event) =>
                        updateField(index, { required: event.target.checked })
                      }
                      className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => removeField(index)}
                    disabled={activeFields.length <= 1}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-sm font-semibold text-[var(--color-ink-muted)] transition hover:border-red-300 hover:text-red-700 disabled:opacity-40"
                    aria-label="Remove field"
                  >
                    -
                  </button>
                </div>
                <Field label="Placeholder" full>
                  <input
                    name={`field_placeholder_${index}`}
                    type="text"
                    value={field.placeholder || ""}
                    onChange={(event) =>
                      updateField(index, { placeholder: event.target.value })
                    }
                    className="form-input bg-white"
                  />
                </Field>
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          {form ? (
            <button
              type="button"
              onClick={handleArchive}
              disabled={submitting || !form.is_active}
              className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-50 disabled:opacity-40"
            >
              Hide Form
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-strong)] disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save Form"}
          </button>
        </div>
      </form>

      <style>{`
        .form-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--color-border);
          background: white;
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          color: var(--color-ink);
        }
        .form-input:focus {
          outline: 2px solid color-mix(in srgb, var(--color-accent) 35%, transparent);
          outline-offset: 1px;
        }
      `}</style>
    </section>
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
    <label className={`block space-y-1 ${full ? "md:col-span-2" : ""}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
