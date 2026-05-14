"use client";

import { useState } from "react";

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

export default function LocalForm({
  formSlug,
  schema,
}: {
  formSlug: string;
  schema: LocalFormSchema;
}) {
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [error, setError] = useState("");

  function update(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");

    try {
      const response = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formSlug,
          payload: values,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Could not submit the form.");
      }
      setStatus("success");
      setValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the form.");
      setStatus("idle");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6 text-sm text-[var(--color-ink-muted)]">
        {schema.successMessage || "Thanks. We received your information."}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm"
    >
      {fields.map((field) => {
        const name = String(field.name || "").trim();
        if (!name) return null;
        return (
          <label key={name} className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              {field.label || name}
            </span>
            <input
              name={name}
              type={field.type || "text"}
              required={Boolean(field.required)}
              value={values[name] || ""}
              onChange={(event) => update(name, event.target.value)}
              placeholder={field.placeholder || ""}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)] focus:bg-white"
            />
          </label>
        );
      })}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)] disabled:opacity-60"
      >
        {status === "submitting"
          ? "Submitting..."
          : schema.submitLabel || "Submit"}
      </button>
    </form>
  );
}
