import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import {
  createLocalFormSubmission,
  extractSubmittedContact,
  getLocalFormBySlug,
  markLocalFormSubmissionsSynced,
  updateLocalFormSubmissionPayload,
  uploadLocalFormFile,
} from "@/lib/local-forms";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UploadedInput = {
  fieldName: string;
  file: File;
  kind: "file" | "image" | "signature";
};

function parseSchemaFields(form: { schema?: unknown }) {
  const schema = form.schema && typeof form.schema === "object" ? form.schema : {};
  const fields = Array.isArray((schema as { fields?: unknown }).fields)
    ? (schema as { fields: Record<string, unknown>[] }).fields
    : [];
  return fields.map((field) => ({
    name: String(field.name || "").trim(),
    type: String(field.type || "text").trim().toLowerCase(),
    required: Boolean(field.required),
  }));
}

function fieldKind(type: string): UploadedInput["kind"] {
  if (type === "signature") return "signature";
  if (type === "image") return "image";
  return "file";
}

function isUploadType(type: string) {
  return ["file", "image", "signature"].includes(type);
}

function valuePresent(value: unknown) {
  if (typeof value === "boolean") return value;
  return String(value ?? "").trim().length > 0;
}

function isTruthy(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function validateRequiredFields({
  fields,
  payload,
  uploads,
}: {
  fields: ReturnType<typeof parseSchemaFields>;
  payload: Record<string, unknown>;
  uploads: UploadedInput[];
}) {
  for (const field of fields) {
    if (!field.required || !field.name) continue;
    if (isUploadType(field.type)) {
      if (!uploads.some((upload) => upload.fieldName === field.name)) {
        return `${field.name} is required.`;
      }
      continue;
    }
    if (!valuePresent(payload[field.name])) {
      return `${field.name} is required.`;
    }
  }
  return "";
}

async function readRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    const body = (await request.json()) as Record<string, unknown>;
    const payload =
      body.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : body;
    return {
      formSlug: String(body.formSlug || body.form_slug || "guest-info").trim(),
      source: String(body.source || "local").trim() || "local",
      preview: isTruthy(body.preview || body.staffPreview),
      payload,
      uploads: [] as UploadedInput[],
    };
  }

  const formData = await request.formData();
  let payload: Record<string, unknown> = {};
  const payloadValue = formData.get("payload");
  if (typeof payloadValue === "string" && payloadValue.trim()) {
    payload = JSON.parse(payloadValue) as Record<string, unknown>;
  }

  const uploads: UploadedInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("file:")) continue;
    if (!(value instanceof File) || value.size <= 0) continue;
    const fieldName = key.slice("file:".length).trim();
    const type = String(formData.get(`fieldType:${fieldName}`) || "file");
    uploads.push({
      fieldName,
      file: value,
      kind: fieldKind(type),
    });
  }

  return {
    formSlug: String(formData.get("formSlug") || "guest-info").trim(),
    source: String(formData.get("source") || "local").trim() || "local",
    preview: isTruthy(formData.get("preview")),
    payload,
    uploads,
  };
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Local form database is not configured yet." },
      { status: 503 }
    );
  }

  let parsed: Awaited<ReturnType<typeof readRequest>>;
  try {
    parsed = await readRequest(request);
  } catch {
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
  }

  const formSlug = parsed.formSlug;
  if (!formSlug) {
    return NextResponse.json({ error: "Form slug is required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const isTrustedPreview =
    parsed.preview === true &&
    cookieStore.get("zc_admin_auth")?.value === "true";

  const form = await getLocalFormBySlug(formSlug);
  if (!form || (form.is_active === false && !isTrustedPreview)) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  const fields = parseSchemaFields(form);
  const requiredError = validateRequiredFields({
    fields,
    payload: parsed.payload,
    uploads: parsed.uploads,
  });
  if (requiredError) {
    return NextResponse.json({ error: requiredError }, { status: 400 });
  }

  const contact = extractSubmittedContact({ payload: parsed.payload });

  if (contact.email && !EMAIL_RE.test(contact.email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  const submittedAt = new Date().toISOString();
  const submissionPayload = isTrustedPreview
    ? {
        ...parsed.payload,
        __staffPreview: true,
        __staffPreviewAt: submittedAt,
      }
    : parsed.payload;

  const submission = await createLocalFormSubmission({
    form,
    formSlug,
    contact,
    payload: submissionPayload,
    source: isTrustedPreview ? "staff-preview" : parsed.source,
  });

  const uploadedFiles = [];
  for (const upload of parsed.uploads) {
    const uploaded = await uploadLocalFormFile({
      formSlug: submission.form_slug,
      submissionId: submission.id,
      fieldName: upload.fieldName,
      file: upload.file,
      kind: upload.kind,
    });
    uploadedFiles.push(uploaded);
  }

  if (uploadedFiles.length > 0) {
    const nextPayload: Record<string, unknown> = {
      ...submissionPayload,
      __files: uploadedFiles,
      __uploadedAt: new Date().toISOString(),
    };
    for (const file of uploadedFiles) {
      if (file.kind === "signature") {
        nextPayload[file.fieldName] = "Signed";
      } else {
        const current = nextPayload[file.fieldName];
        const names = Array.isArray(current)
          ? current
          : current
            ? [current]
            : [];
        nextPayload[file.fieldName] = [...names, file.fileName];
      }
    }
    await updateLocalFormSubmissionPayload(submission.id, nextPayload);
  }

  if (isTrustedPreview) {
    await markLocalFormSubmissionsSynced([submission.id]);
  }

  return NextResponse.json({
    ok: true,
    submissionId: submission.id,
    formSlug: submission.form_slug,
    submittedAt: submission.submitted_at,
  });
}
