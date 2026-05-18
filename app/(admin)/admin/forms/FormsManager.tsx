"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import LocalForm from "@/components/customer/LocalForm";
import { LOCAL_FORM_STAY_UNIT_OPTIONS } from "@/lib/local-form-options";
import { archiveLocalForm, deleteLocalForm, saveLocalForm } from "./actions";

type LocalFormField = {
  name: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  optionSource?: string;
  multiple?: boolean;
};

type LocalFormSchema = {
  fields?: LocalFormField[];
  subtitle?: string;
  introText?: string;
  termsText?: string;
  submitLabel?: string;
  successMessage?: string;
};

type FormDraftSettings = {
  name: string;
  slug: string;
  description: string;
  introText: string;
  termsText: string;
  submitLabel: string;
  successMessage: string;
  isActive: boolean;
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

export type LocalFormSubmissionFile = {
  fieldName: string;
  kind: string;
  fileName: string;
  path?: string;
  contentType?: string;
  size?: number;
  signedUrl?: string;
};

export type LocalFormSubmissionRow = {
  id: string;
  form_slug: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  submitted_at: string;
  payload: Record<string, unknown> & {
    __files?: LocalFormSubmissionFile[];
  };
};

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; form: LocalFormRow };

type FieldTemplate = LocalFormField & {
  id: string;
  title: string;
  description: string;
  unique?: boolean;
};

const DEFAULT_FIELDS: LocalFormField[] = [
  { name: "firstName", label: "First Name", type: "text", required: true },
  { name: "lastName", label: "Last Name", type: "text", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "phone", label: "Phone", type: "tel", required: false },
  {
    name: "bookingCode",
    label: "Booking Code",
    type: "text",
    required: false,
    helpText:
      "Please use your Zenfulcove/Lodgify booking confirmation ID. This is not your Expedia, Airbnb, or Vrbo confirmation number.",
  },
  {
    name: "stayUnit",
    label: "Unit You're Staying In",
    type: "select",
    required: true,
    optionSource: "stayUnits",
    options: LOCAL_FORM_STAY_UNIT_OPTIONS,
  },
  {
    name: "stayDates",
    label: "Check-in and Check-out Dates",
    type: "dateRange",
    required: true,
  },
  {
    name: "photoUpload",
    label: "Image Upload",
    type: "image",
    required: false,
    multiple: true,
  },
  {
    name: "signature",
    label: "Signature",
    type: "signature",
    required: true,
  },
];

const FIELD_LIBRARY_GROUPS: {
  title: string;
  description: string;
  fields: FieldTemplate[];
}[] = [
  {
    title: "Guest Details",
    description: "Common contact and reservation fields.",
    fields: [
      {
        id: "firstName",
        title: "First Name",
        description: "Guest first name.",
        name: "firstName",
        label: "First Name",
        type: "text",
        required: true,
        unique: true,
      },
      {
        id: "lastName",
        title: "Last Name",
        description: "Guest last name.",
        name: "lastName",
        label: "Last Name",
        type: "text",
        required: true,
        unique: true,
      },
      {
        id: "email",
        title: "Email",
        description: "Required for SendGrid sync.",
        name: "email",
        label: "Email",
        type: "email",
        required: true,
        unique: true,
      },
      {
        id: "phone",
        title: "Phone",
        description: "Guest mobile or contact number.",
        name: "phone",
        label: "Phone",
        type: "tel",
        required: false,
        unique: true,
      },
      {
        id: "bookingCode",
        title: "Booking Code",
        description: "Code used to connect a guest to their reservation.",
        name: "bookingCode",
        label: "Booking Code",
        type: "text",
        required: false,
        helpText:
          "Please use your Zenfulcove/Lodgify booking confirmation ID. This is not your Expedia, Airbnb, or Vrbo confirmation number.",
        unique: true,
      },
      {
        id: "stayUnit",
        title: "Stay Unit",
        description: "Dropdown populated from the Zenfulcove unit list.",
        name: "stayUnit",
        label: "Unit You're Staying In",
        type: "select",
        required: true,
        options: LOCAL_FORM_STAY_UNIT_OPTIONS,
        optionSource: "stayUnits",
        unique: true,
      },
      {
        id: "stayDates",
        title: "Stay Dates",
        description: "Check-in and check-out date range.",
        name: "stayDates",
        label: "Check-in and Check-out Dates",
        type: "dateRange",
        required: true,
        unique: true,
      },
    ],
  },
  {
    title: "Fields",
    description: "Questions and structured responses.",
    fields: [
      {
        id: "shortAnswer",
        title: "Short Answer",
        description: "One-line text response.",
        name: "shortAnswer",
        label: "Short Answer",
        type: "text",
        placeholder: "Type your answer",
      },
      {
        id: "longAnswer",
        title: "Long Answer",
        description: "Multi-line response.",
        name: "longAnswer",
        label: "Long Answer",
        type: "textarea",
        placeholder: "Add details",
      },
      {
        id: "select",
        title: "Dropdown",
        description: "Single choice from options.",
        name: "choice",
        label: "Choice",
        type: "select",
        options: ["Option 1", "Option 2"],
      },
      {
        id: "checkbox",
        title: "Checkbox",
        description: "Agreement or yes/no acknowledgement.",
        name: "confirmation",
        label: "I confirm this information is accurate.",
        type: "checkbox",
      },
      {
        id: "date",
        title: "Date",
        description: "Calendar date response.",
        name: "date",
        label: "Date",
        type: "date",
      },
      {
        id: "dateRange",
        title: "Date Range",
        description: "Two linked date inputs for a start and end date.",
        name: "dateRange",
        label: "Date Range",
        type: "dateRange",
      },
      {
        id: "number",
        title: "Number",
        description: "Numeric response.",
        name: "quantity",
        label: "Quantity",
        type: "number",
      },
      {
        id: "section",
        title: "Section",
        description: "Heading and optional note for grouping questions.",
        name: "section",
        label: "Section Title",
        type: "section",
        placeholder: "Add a short section introduction.",
      },
    ],
  },
  {
    title: "Uploads & Consent",
    description: "Documents, images, and signed acknowledgements.",
    fields: [
      {
        id: "imageUpload",
        title: "Image Upload",
        description: "Photo or image attachment.",
        name: "photoUpload",
        label: "Image Upload",
        type: "image",
        multiple: true,
      },
      {
        id: "fileUpload",
        title: "File Upload",
        description: "PDF, document, spreadsheet, or image.",
        name: "fileUpload",
        label: "File Upload",
        type: "file",
        multiple: true,
      },
      {
        id: "signature",
        title: "Signature",
        description: "Canvas signature capture.",
        name: "signature",
        label: "Signature",
        type: "signature",
        required: true,
        unique: true,
      },
      {
        id: "terms",
        title: "Terms Read-Through",
        description: "Scrollable terms text with an agreement checkbox.",
        name: "termsAgreement",
        label: "I have read and agree to the terms and conditions.",
        type: "terms",
        required: true,
        unique: true,
      },
    ],
  },
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
  return fields.map((field) => {
    const type = String(field.type || "text");
    return {
    name: String(field.name || ""),
    label: String(field.label || ""),
    type: type.toLowerCase() === "daterange" ? "dateRange" : type,
    required: Boolean(field.required),
    placeholder: String(field.placeholder || ""),
    helpText: String(field.helpText || ""),
    options: Array.isArray(field.options)
      ? field.options.map((option) => String(option))
      : [],
    optionSource: String(field.optionSource || ""),
    multiple:
      field.type === "image" || field.type === "file"
        ? field.multiple !== false
        : undefined,
    };
  });
}

function fieldType(field: LocalFormField) {
  return String(field.type || "text").toLowerCase();
}

function makeUniqueName(baseName: string, fields: LocalFormField[]) {
  const normalizedBase = baseName.replace(/[^A-Za-z0-9_]/g, "") || "field";
  const used = new Set(fields.map((field) => String(field.name || "")));
  if (!used.has(normalizedBase)) return normalizedBase;

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${normalizedBase}${index}`;
    if (!used.has(candidate)) return candidate;
  }

  return `${normalizedBase}${Date.now()}`;
}

function fieldFromTemplate(template: FieldTemplate, fields: LocalFormField[]) {
  const field = {
    name: template.name,
    label: template.label,
    type: template.type,
    required: template.required,
    placeholder: template.placeholder,
    helpText: template.helpText,
    options: template.options,
    optionSource: template.optionSource,
    multiple: template.multiple,
  };
  const name = template.unique ? field.name : makeUniqueName(field.name, fields);
  const suffix = name === field.name ? "" : ` ${name.replace(field.name, "")}`;

  return {
    ...field,
    name,
    label: suffix
      ? `${field.label || template.title}${suffix}`
      : field.label || template.title,
    required: Boolean(field.required),
    options: field.options || [],
    helpText: field.helpText || "",
    optionSource: field.optionSource || "",
    multiple:
      field.type === "image" || field.type === "file"
        ? field.multiple !== false
        : undefined,
  };
}

function fieldKey(field: LocalFormField, index: number) {
  return field.name || `field-${index}`;
}

function templateCount(template: FieldTemplate, fields: LocalFormField[]) {
  if (template.unique) {
    return fields.some((field) => field.name === template.name) ? 1 : 0;
  }

  return fields.filter((field) => {
    const name = String(field.name || "");
    return name === template.name || name.startsWith(`${template.name}`);
  }).length;
}

function acceptsPlaceholder(type: string) {
  return ["text", "email", "tel", "number", "date", "textarea", "section"].includes(type);
}

export default function FormsManager({
  forms,
  stats,
  submissionsBySlug,
}: {
  forms: LocalFormRow[];
  stats: Record<string, LocalFormStats>;
  submissionsBySlug: Record<string, LocalFormSubmissionRow[]>;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(form: LocalFormRow) {
    if (
      !window.confirm(
        `Delete ${form.name}? This removes the form from the admin list. Existing submissions stay in the database.`
      )
    ) {
      return;
    }

    setDeletingId(form.id);
    try {
      await deleteLocalForm(form.id);
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  if (editor.mode !== "closed") {
    return (
      <FormEditor
        key={editor.mode === "edit" ? editor.form.id : "create"}
        form={editor.mode === "edit" ? editor.form : undefined}
        onClose={() => setEditor({ mode: "closed" })}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[var(--color-border)] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
              Customer Portal
            </p>
            <h2 className="mt-1 font-serif text-2xl font-medium tracking-tight">
              Forms
            </h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Create forms, review activity, and publish drafts when ready.
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
            className="m-5 w-[calc(100%-2.5rem)] rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-8 text-center text-sm text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent)] hover:bg-white hover:text-[var(--color-accent)]"
          >
            No forms yet. Create the first customer form.
          </button>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {forms.map((form) => {
              const formStats = stats[form.slug] || {
                submissions: 0,
                unsynced: 0,
                lastSubmittedAt: null,
              };
              const recentSubmissions = submissionsBySlug[form.slug] || [];
              return (
                <article
                  key={form.id}
                  className="group p-4 transition hover:bg-[var(--color-bg)]"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <button
                      type="button"
                      onClick={() => setEditor({ mode: "edit", form })}
                      className="min-w-0 flex-1 rounded-xl p-2 text-left transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-serif text-xl font-medium tracking-tight">
                          {form.name}
                        </p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                            form.is_active
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {form.is_active ? "Active" : "Draft"}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-[var(--color-ink-muted)]">
                        /forms/{form.slug}
                      </p>
                      {form.description ? (
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
                          {form.description}
                        </p>
                      ) : null}
                    </button>

                    <div className="grid gap-3 sm:grid-cols-[1fr_auto] xl:min-w-[34rem] xl:grid-cols-[1fr_auto]">
                      <div className="grid gap-2 text-sm sm:grid-cols-3">
                        <Metric
                          label="Submissions"
                          value={formStats.submissions}
                        />
                        <Metric label="Unsynced" value={formStats.unsynced} />
                        <Metric
                          label="Latest"
                          value={formatDate(formStats.lastSubmittedAt)}
                        />
                      </div>

                      <div className="flex flex-wrap items-start gap-2 sm:justify-end">
                        <Link
                          href={
                            form.is_active
                              ? `/forms/${form.slug}`
                              : `/forms/${form.slug}?preview=1`
                          }
                          className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:bg-[var(--color-bg)] hover:text-[var(--color-accent)]"
                        >
                          Preview
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(form)}
                          disabled={deletingId === form.id}
                          className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === form.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {recentSubmissions.length > 0 ? (
                    <div className="mt-4 pl-2">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
                        Recent Submissions
                      </p>
                      <div className="grid gap-3 lg:grid-cols-3">
                        {recentSubmissions.slice(0, 3).map((submission) => (
                          <SubmissionPreview
                            key={submission.id}
                            submission={submission}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SubmissionPreview({
  submission,
}: {
  submission: LocalFormSubmissionRow;
}) {
  const name = [submission.first_name, submission.last_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  const files = Array.isArray(submission.payload?.__files)
    ? submission.payload.__files
    : [];

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
            {name || submission.email || "Submission"}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
            {formatDate(submission.submitted_at)}
          </p>
        </div>
        {submission.email ? (
          <a
            href={`mailto:${submission.email}`}
            className="truncate text-xs font-medium text-[var(--color-accent)]"
          >
            {submission.email}
          </a>
        ) : null}
      </div>
      {files.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <a
              key={`${file.path || file.fileName}-${index}`}
              href={file.signedUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {file.kind === "signature" ? "Signature" : file.fileName}
            </a>
          ))}
        </div>
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
    form ? fieldsFrom(form) : []
  );
  const [settings, setSettings] = useState<FormDraftSettings>(() => ({
    name: form?.name || "",
    slug: form?.slug || "",
    description: initialSchema.subtitle || form?.description || "",
    introText: initialSchema.introText || "",
    termsText: initialSchema.termsText || "",
    submitLabel: initialSchema.submitLabel || "Submit",
    successMessage:
      initialSchema.successMessage || "Thanks. We received your information.",
    isActive: form?.is_active ?? false,
  }));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
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

  const selectedFieldNames = useMemo(
    () => new Set(activeFields.map((field) => String(field.name || ""))),
    [activeFields]
  );

  const safeSelectedIndex =
    activeFields.length === 0
      ? -1
      : Math.min(selectedIndex, activeFields.length - 1);

  const previewSchema = useMemo(
    () => ({
      fields: activeFields,
      subtitle: settings.description,
      introText: settings.introText,
      termsText: settings.termsText,
      submitLabel: settings.submitLabel || "Submit",
      successMessage:
        settings.successMessage || "Thanks. We received your information.",
    }),
    [
      activeFields,
      settings.description,
      settings.introText,
      settings.submitLabel,
      settings.successMessage,
      settings.termsText,
    ]
  );

  function updateSettings(patch: Partial<FormDraftSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

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

  function addBlankField() {
    const next = [
      ...fields,
      {
        name: makeUniqueName("customField", fields),
        label: "Custom Field",
        type: "text",
        required: false,
        placeholder: "",
        helpText: "",
        options: [],
        optionSource: "",
        multiple: true,
      },
    ];
    setFields(next);
    setSelectedIndex(next.length - 1);
  }

  function addTemplate(template: FieldTemplate) {
    if (template.unique) {
      const existingIndex = fields.findIndex(
        (field) => field.name === template.name
      );
      if (existingIndex >= 0) {
        setSelectedIndex(existingIndex);
        return;
      }
    }

    const next = [...fields, fieldFromTemplate(template, fields)];
    setFields(next);
    setSelectedIndex(next.length - 1);
  }

  function removeField(index: number) {
    const next = fields.filter((_, fieldIndex) => fieldIndex !== index);
    setFields(next);
    setSelectedIndex((currentIndex) => {
      if (next.length === 0) return 0;
      if (currentIndex > index) return currentIndex - 1;
      return Math.min(currentIndex, next.length - 1);
    });
  }

  function moveField(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fields.length) return;
    const next = [...fields];
    const [field] = next.splice(index, 1);
    next.splice(nextIndex, 0, field);
    setFields(next);
    setSelectedIndex(nextIndex);
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
    <section className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
      <form onSubmit={handleSubmit}>
        {form ? <input type="hidden" name="id" value={form.id} /> : null}

        <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:bg-[var(--color-bg)] hover:text-[var(--color-accent)]"
            >
              Back
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                {isEdit ? "Editing Form" : "New Draft"}
              </p>
              <h3 className="truncate font-serif text-xl font-medium tracking-tight">
                {isEdit
                  ? settings.name || form?.name
                  : settings.name || "Build a customer form"}
              </h3>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              disabled={activeFields.length === 0}
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:bg-[var(--color-bg)] hover:text-[var(--color-accent)] disabled:opacity-45"
            >
              Preview
            </button>
            {form ? (
              <button
                type="button"
                onClick={handleArchive}
                disabled={submitting || !form.is_active}
                className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-50 disabled:opacity-40"
              >
                Hide
              </button>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-accent-strong)] disabled:opacity-60"
            >
              {submitting ? "Saving..." : form ? "Save Changes" : "Save Draft"}
            </button>
          </div>
        </div>

        {error ? (
          <p className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_280px] 2xl:grid-cols-[250px_minmax(620px,1fr)_320px]">
          <aside className="min-w-0 border-b border-[var(--color-border)] bg-[var(--color-bg)] p-4 lg:border-b-0 lg:border-r">
            <FieldLibrary
              fields={activeFields}
              selectedFieldNames={selectedFieldNames}
              selectedIndex={safeSelectedIndex}
              onSelect={addTemplate}
            />
          </aside>

          <LiveFormEditor
            fields={activeFields}
            selectedIndex={safeSelectedIndex}
            onSelect={setSelectedIndex}
            addBlankField={addBlankField}
            updateField={updateField}
            removeField={removeField}
            moveField={moveField}
          />

          <FormSettings settings={settings} onChange={updateSettings} />
        </div>
      </form>

      {previewOpen ? (
        <CustomerPreviewModal
          title={settings.name || "Untitled Form"}
          subtitle={settings.description}
          introText={settings.introText}
          schema={previewSchema}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}

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

function FormSettings({
  settings,
  onChange,
}: {
  settings: FormDraftSettings;
  onChange: (patch: Partial<FormDraftSettings>) => void;
}) {
  return (
    <aside className="min-w-0 border-t border-[var(--color-border)] bg-[var(--color-bg)] p-4 lg:border-l lg:border-t-0">
      <div className="space-y-4 lg:sticky lg:top-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Form Settings
          </p>
          <h4 className="mt-1 font-serif text-xl font-medium tracking-tight">
            Name and publish
          </h4>
        </div>

        <Field label="Form Name">
          <input
            name="name"
            type="text"
            required
            value={settings.name}
            onChange={(event) => onChange({ name: event.target.value })}
            className="form-input"
          />
        </Field>

        <Field label="Subtitle">
          <textarea
            name="description"
            value={settings.description}
            onChange={(event) =>
              onChange({ description: event.target.value })
            }
            rows={2}
            placeholder="A short line under the form title"
            className="form-input resize-y"
          />
        </Field>

        <Field label="Welcome Paragraph">
          <textarea
            name="intro_text"
            value={settings.introText}
            onChange={(event) => onChange({ introText: event.target.value })}
            rows={5}
            placeholder="Plain text that welcomes guests and explains the form."
            className="form-input resize-y"
          />
        </Field>

        <label className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm">
          <span>
            <span className="block font-semibold text-[var(--color-ink)]">
              Publish
            </span>
            <span className="mt-1 block text-xs text-[var(--color-ink-muted)]">
              Off keeps this as a staff-only draft.
            </span>
          </span>
          <input
            name="is_active"
            type="checkbox"
            checked={settings.isActive}
            onChange={(event) => onChange({ isActive: event.target.checked })}
            className="h-5 w-5 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
          />
        </label>

        <details className="rounded-xl border border-[var(--color-border)] bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-bg)]">
            Advanced details
          </summary>
          <div className="space-y-4 border-t border-[var(--color-border)] p-4">
            <Field label="Slug">
              <input
                name="slug"
                type="text"
                value={settings.slug}
                onChange={(event) => onChange({ slug: event.target.value })}
                placeholder="guest-info"
                className="form-input"
              />
            </Field>
            <Field label="Terms and Conditions">
              <textarea
                name="terms_text"
                value={settings.termsText}
                onChange={(event) =>
                  onChange({ termsText: event.target.value })
                }
                rows={8}
                placeholder="Paste the terms and conditions that should appear in forms using the terms read-through field."
                className="form-input resize-y"
              />
            </Field>
            <Field label="Submit Button">
              <input
                name="submit_label"
                type="text"
                value={settings.submitLabel}
                onChange={(event) =>
                  onChange({ submitLabel: event.target.value })
                }
                className="form-input"
              />
            </Field>
            <Field label="Success Message">
              <input
                name="success_message"
                type="text"
                value={settings.successMessage}
                onChange={(event) =>
                  onChange({ successMessage: event.target.value })
                }
                className="form-input"
              />
            </Field>
          </div>
        </details>
      </div>
    </aside>
  );
}

function CustomerPreviewModal({
  title,
  subtitle,
  introText,
  schema,
  onClose,
}: {
  title: string;
  subtitle: string;
  introText: string;
  schema: LocalFormSchema;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--color-ink)]/35 px-4 py-6">
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="fixed inset-0 h-full w-full cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customer form preview"
        className="relative mx-auto w-full max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-2xl md:p-6"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              Customer Preview
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Unsaved draft view
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] bg-white text-lg font-semibold leading-none text-[var(--color-ink-muted)] transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            aria-label="Close preview"
          >
            ×
          </button>
        </div>

        <div className="mx-auto max-w-xl space-y-6 rounded-2xl bg-[var(--color-bg)]">
          <header>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
              Zenfulcove
            </p>
            <h1 className="mt-2 font-serif text-4xl font-medium leading-[1.05] tracking-tight">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {subtitle}
              </p>
            ) : null}
            {introText ? (
              <p className="mt-4 whitespace-pre-line rounded-xl border border-[var(--color-border)] bg-white p-4 text-sm leading-relaxed text-[var(--color-ink)]">
                {introText}
              </p>
            ) : null}
          </header>

          <LocalForm formSlug="preview" schema={schema} preview />
        </div>
      </div>
    </div>
  );
}

function LiveFormEditor({
  fields,
  selectedIndex,
  onSelect,
  addBlankField,
  updateField,
  removeField,
  moveField,
}: {
  fields: LocalFormField[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  addBlankField: () => void;
  updateField: (index: number, patch: Partial<LocalFormField>) => void;
  removeField: (index: number) => void;
  moveField: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <section className="min-h-[38rem] min-w-0 bg-white p-5 xl:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Form Builder
          </p>
          <h4 className="mt-1 font-serif text-2xl font-medium tracking-tight">
            Edit the form directly
          </h4>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Save the draft, then use Preview to see the customer view.
          </p>
        </div>
        <button
          type="button"
          onClick={addBlankField}
          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:bg-[var(--color-bg)] hover:text-[var(--color-accent)]"
        >
          Custom Field
        </button>
      </div>

      <input type="hidden" name="field_count" value={fields.length} />

      {fields.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-10 text-center">
          <p className="font-serif text-xl font-medium text-[var(--color-ink)]">
            Add fields from the left
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--color-ink-muted)]">
            The form will appear here. Labels, type, required state, order, and
            options can be edited directly in this preview.
          </p>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-4xl space-y-3">
          {fields.map((field, index) => (
            <EditablePreviewField
              key={fieldKey(field, index)}
              field={field}
              index={index}
              fieldCount={fields.length}
              selected={index === selectedIndex}
              onSelect={() => onSelect(index)}
              updateField={updateField}
              removeField={removeField}
              moveField={moveField}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EditablePreviewField({
  field,
  index,
  fieldCount,
  selected,
  onSelect,
  updateField,
  removeField,
  moveField,
}: {
  field: LocalFormField;
  index: number;
  fieldCount: number;
  selected: boolean;
  onSelect: () => void;
  updateField: (index: number, patch: Partial<LocalFormField>) => void;
  removeField: (index: number) => void;
  moveField: (index: number, direction: -1 | 1) => void;
}) {
  const type = fieldType(field);

  return (
    <article
      onFocusCapture={onSelect}
      className={`rounded-2xl border bg-white p-3 shadow-sm transition ${
        selected
          ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/15"
          : "border-[var(--color-border)] hover:border-[var(--color-accent)]/60"
      }`}
    >
      <input
        type="hidden"
        name={`field_name_${index}`}
        value={field.name || ""}
        readOnly
      />
      <input
        type="hidden"
        name={`field_option_source_${index}`}
        value={field.optionSource || ""}
        readOnly
      />
      {!acceptsPlaceholder(type) ? (
        <input
          type="hidden"
          name={`field_placeholder_${index}`}
          value={field.placeholder || ""}
          readOnly
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <input
            name={`field_label_${index}`}
            type="text"
            value={field.label || ""}
            onChange={(event) =>
              updateField(index, { label: event.target.value })
            }
            onFocus={onSelect}
            className="w-full rounded-lg border border-transparent bg-transparent px-1 py-1 font-serif text-xl font-medium tracking-tight text-[var(--color-ink)] outline-none transition hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:bg-[var(--color-bg)]"
            placeholder="Field label"
          />
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => moveField(index, -1)}
            disabled={index === 0}
            title="Move up"
            aria-label="Move field up"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] text-base font-semibold leading-none text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent)] hover:bg-[var(--color-bg)] hover:text-[var(--color-accent)] disabled:opacity-35"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => moveField(index, 1)}
            disabled={index === fieldCount - 1}
            title="Move down"
            aria-label="Move field down"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] text-base font-semibold leading-none text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent)] hover:bg-[var(--color-bg)] hover:text-[var(--color-accent)] disabled:opacity-35"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => removeField(index)}
            title="Remove field"
            aria-label="Remove field"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)] text-lg font-semibold leading-none text-[var(--color-ink-muted)] transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            ×
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
        <Field label="Type">
          <select
            name={`field_type_${index}`}
            value={field.type || "text"}
            onChange={(event) =>
              updateField(index, { type: event.target.value })
            }
            onFocus={onSelect}
            className="form-input bg-white"
          >
            <option value="text">Text</option>
            <option value="email">Email</option>
            <option value="tel">Phone</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="dateRange">Date Range</option>
            <option value="textarea">Long Text</option>
            <option value="select">Select</option>
            <option value="checkbox">Checkbox</option>
            <option value="image">Image Upload</option>
            <option value="file">File Upload</option>
            <option value="section">Section Break</option>
            <option value="signature">Signature</option>
            <option value="terms">Terms Read-Through</option>
          </select>
        </Field>

        {acceptsPlaceholder(type) ? (
          <Field label={type === "section" ? "Section Body" : "Placeholder"}>
            {type === "section" ? (
              <textarea
                name={`field_placeholder_${index}`}
                value={field.placeholder || ""}
                onChange={(event) =>
                  updateField(index, { placeholder: event.target.value })
                }
                onFocus={onSelect}
                rows={2}
                className="form-input resize-y bg-white"
                placeholder="Optional section introduction"
              />
            ) : (
              <input
                name={`field_placeholder_${index}`}
                type="text"
                value={field.placeholder || ""}
                onChange={(event) =>
                  updateField(index, { placeholder: event.target.value })
                }
                onFocus={onSelect}
                className="form-input bg-white"
                placeholder="Optional placeholder"
              />
            )}
          </Field>
        ) : (
          <span />
        )}

        {type === "section" ? (
          <span />
        ) : (
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-medium">
            <input
              name={`field_required_${index}`}
              type="checkbox"
              checked={Boolean(field.required)}
              onChange={(event) =>
                updateField(index, { required: event.target.checked })
              }
              onFocus={onSelect}
              className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
            />
            {type === "terms" ? "Require agreement" : "Required"}
          </label>
        )}
      </div>

      <div className="mt-3">
        <Field label={type === "section" ? "Please Read Note" : "Info Button Note"}>
          <textarea
            name={`field_help_text_${index}`}
            value={field.helpText || ""}
            onChange={(event) =>
              updateField(index, { helpText: event.target.value })
            }
            onFocus={onSelect}
            rows={2}
            placeholder="Optional note shown from the i button"
            className="form-input resize-y bg-white"
          />
        </Field>
      </div>

      {type === "select" ? (
        <div className="mt-3">
          {field.optionSource === "stayUnits" ? (
            <>
              <input
                type="hidden"
                name={`field_options_${index}`}
                value={(field.options || LOCAL_FORM_STAY_UNIT_OPTIONS).join("\n")}
                readOnly
              />
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs leading-relaxed text-[var(--color-ink-muted)]">
                <p className="font-semibold text-[var(--color-ink)]">
                  Unit dropdown
                </p>
                <p className="mt-1">
                  Uses the Zenfulcove Lodgify property map:
                </p>
                <p className="mt-2">
                  {(field.options || LOCAL_FORM_STAY_UNIT_OPTIONS).join(", ")}
                </p>
              </div>
            </>
          ) : (
            <Field label="Options">
              <textarea
                name={`field_options_${index}`}
                value={(field.options || []).join("\n")}
                onChange={(event) =>
                  updateField(index, {
                    options: event.target.value
                      .split(/\r?\n|,/)
                      .map((option) => option.trim())
                      .filter(Boolean),
                  })
                }
                onFocus={onSelect}
                rows={3}
                placeholder="One option per line"
                className="form-input resize-y bg-white"
              />
            </Field>
          )}
        </div>
      ) : null}

      {(type === "image" || type === "file") && (
        <label className="mt-3 flex min-h-10 w-max items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-medium">
          <input
            name={`field_multiple_${index}`}
            type="checkbox"
            checked={field.multiple !== false}
            onChange={(event) =>
              updateField(index, {
                multiple: event.target.checked,
              })
            }
            onFocus={onSelect}
            className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
          />
          Allow multiple files
        </label>
      )}
    </article>
  );
}

function FieldLibrary({
  fields,
  selectedFieldNames,
  selectedIndex,
  onSelect,
}: {
  fields: LocalFormField[];
  selectedFieldNames: Set<string>;
  selectedIndex: number;
  onSelect: (template: FieldTemplate) => void;
}) {
  return (
    <div className="space-y-5 lg:sticky lg:top-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
          Field Library
        </p>
      </div>

      {FIELD_LIBRARY_GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            {group.title}
          </p>
          <div className="flex flex-wrap gap-2">
            {group.fields.map((template) => {
              const count = templateCount(template, fields);
              const selected =
                template.unique && selectedFieldNames.has(template.name);
              const focusedName =
                selectedIndex >= 0 ? String(fields[selectedIndex]?.name || "") : "";
              const focused =
                focusedName === template.name ||
                (!template.unique && focusedName.startsWith(template.name));
              const active = selected || focused || count > 0;
              return (
                <button
                  key={template.id}
                  type="button"
                  title={template.description}
                  aria-label={`${selected ? "Focus" : "Add"} ${template.title}. ${template.description}`}
                  onClick={() => onSelect(template)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white shadow-sm"
                      : "border-[var(--color-border)] bg-white text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:bg-white hover:text-[var(--color-accent)]"
                  }`}
                >
                  <span>
                    {selected ? "Added " : count > 0 ? `${count} ` : "+ "}
                    {template.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
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
