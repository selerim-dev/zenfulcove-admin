"use client";

import { useEffect, useRef, useState } from "react";

type LocalFormField = {
  name: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  multiple?: boolean;
};

type LocalFormSchema = {
  fields?: LocalFormField[];
  submitLabel?: string;
  successMessage?: string;
};

type SignaturePadProps = {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
};

const inputClass =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)] focus:bg-white";

function dataUrlToBlob(dataUrl: string) {
  const [meta, data] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);/)?.[1] || "image/png";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

function SignaturePad({ label, required, value, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#1a2820";
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    hasInkRef.current = true;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas && hasInkRef.current) {
      onChange(canvas.toDataURL("image/png"));
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
    onChange("");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
          {label}
          {required ? " *" : ""}
        </span>
        <button
          type="button"
          onClick={clear}
          className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        className="h-40 w-full touch-none rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]"
      />
      <p className="text-xs text-[var(--color-ink-muted)]">
        Sign inside the box using your finger, mouse, or trackpad.
      </p>
    </div>
  );
}

export default function LocalForm({
  formSlug,
  schema,
  preview = false,
  staffPreview = false,
}: {
  formSlug: string;
  schema: LocalFormSchema;
  preview?: boolean;
  staffPreview?: boolean;
}) {
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [error, setError] = useState("");

  function update(name: string, value: string | boolean) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function updateFiles(name: string, fileList: FileList | null) {
    setFiles((current) => ({
      ...current,
      [name]: fileList ? Array.from(fileList) : [],
    }));
  }

  function validateRequired() {
    for (const field of fields) {
      const name = String(field.name || "").trim();
      if (!name || !field.required) continue;
      const type = String(field.type || "text").toLowerCase();
      if (type === "signature" && !signatures[name]) {
        return `${field.label || name} is required.`;
      }
      if ((type === "file" || type === "image") && !(files[name]?.length > 0)) {
        return `${field.label || name} is required.`;
      }
      if (type === "checkbox" && values[name] !== true) {
        return `${field.label || name} is required.`;
      }
      if (!["file", "image", "signature", "checkbox"].includes(type)) {
        const value = values[name];
        if (!String(value || "").trim()) {
          return `${field.label || name} is required.`;
        }
      }
    }
    return "";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (preview) return;

    setStatus("submitting");
    setError("");

    const requiredError = validateRequired();
    if (requiredError) {
      setError(requiredError);
      setStatus("idle");
      return;
    }

    const payload: Record<string, unknown> = {};
    const formData = new FormData();
    formData.append("formSlug", formSlug);
    formData.append("source", staffPreview ? "staff-preview" : "local");
    if (staffPreview) {
      formData.append("preview", "1");
    }

    for (const field of fields) {
      const name = String(field.name || "").trim();
      if (!name) continue;
      const type = String(field.type || "text").toLowerCase();

      if (type === "file" || type === "image") {
        const selectedFiles = files[name] || [];
        payload[name] = selectedFiles.map((file) => file.name);
        for (const file of selectedFiles) {
          formData.append(`file:${name}`, file, file.name);
        }
        formData.append(`fieldType:${name}`, type);
        continue;
      }

      if (type === "signature") {
        if (signatures[name]) {
          const blob = dataUrlToBlob(signatures[name]);
          formData.append(`file:${name}`, blob, `${name}-signature.png`);
          payload[name] = "Signed";
        }
        formData.append(`fieldType:${name}`, "signature");
        continue;
      }

      payload[name] = values[name] ?? "";
    }

    formData.append("payload", JSON.stringify(payload));

    try {
      const response = await fetch("/api/forms/submit", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Could not submit the form.");
      }
      setStatus("success");
      setValues({});
      setFiles({});
      setSignatures({});
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
      className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm"
    >
      {fields.map((field) => {
        const name = String(field.name || "").trim();
        if (!name) return null;
        const type = String(field.type || "text").toLowerCase();
        const label = field.label || name;

        if (type === "textarea") {
          return (
            <FieldShell key={name} label={label} required={field.required}>
              <textarea
                name={name}
                required={Boolean(field.required)}
                value={String(values[name] || "")}
                onChange={(event) => update(name, event.target.value)}
                placeholder={field.placeholder || ""}
                rows={4}
                className={`${inputClass} resize-y`}
              />
            </FieldShell>
          );
        }

        if (type === "select") {
          const options = Array.isArray(field.options) ? field.options : [];
          return (
            <FieldShell key={name} label={label} required={field.required}>
              <select
                name={name}
                required={Boolean(field.required)}
                value={String(values[name] || "")}
                onChange={(event) => update(name, event.target.value)}
                className={inputClass}
              >
                <option value="">Select one</option>
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </FieldShell>
          );
        }

        if (type === "checkbox") {
          return (
            <label
              key={name}
              className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
            >
              <input
                name={name}
                type="checkbox"
                checked={values[name] === true}
                onChange={(event) => update(name, event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
              />
              <span className="text-sm text-[var(--color-ink)]">
                {label}
                {field.required ? " *" : ""}
              </span>
            </label>
          );
        }

        if (type === "file" || type === "image") {
          return (
            <FieldShell key={name} label={label} required={field.required}>
              <input
                name={name}
                type="file"
                required={Boolean(field.required)}
                multiple={field.multiple !== false}
                accept={type === "image" ? "image/*" : undefined}
                onChange={(event) => updateFiles(name, event.target.files)}
                className="block w-full cursor-pointer rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-ink)] file:mr-3 file:cursor-pointer file:border-0 file:bg-[var(--color-accent)] file:px-4 file:py-3 file:text-sm file:font-medium file:text-white"
              />
              <span className="mt-1 block text-xs text-[var(--color-ink-muted)]">
                {type === "image"
                  ? "Upload image files up to 5MB each."
                  : "Upload files up to 5MB each."}
              </span>
            </FieldShell>
          );
        }

        if (type === "signature") {
          return (
            <SignaturePad
              key={name}
              label={label}
              required={field.required}
              value={signatures[name] || ""}
              onChange={(value) =>
                setSignatures((current) => ({ ...current, [name]: value }))
              }
            />
          );
        }

        return (
          <FieldShell key={name} label={label} required={field.required}>
            <input
              name={name}
              type={type || "text"}
              required={Boolean(field.required)}
              value={String(values[name] || "")}
              onChange={(event) => update(name, event.target.value)}
              placeholder={field.placeholder || ""}
              className={inputClass}
            />
          </FieldShell>
        );
      })}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type={preview ? "button" : "submit"}
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

function FieldShell({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}
