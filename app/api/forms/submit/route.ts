import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appendLogs } from "@/lib/activity-log";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import {
  createLocalFormSubmission,
  extractSubmittedContact,
  getLocalFormSubmissionById,
  getLocalFormBySlug,
  localFormSubmissionMatchesBooking,
  markLocalFormSubmissionsSynced,
  updateLocalFormSubmission,
  updateLocalFormSubmissionPayload,
  uploadLocalFormFile,
  validateLocalFormUpload,
} from "@/lib/local-forms";
import { maybeSendSameDayAccessCodeForSubmission } from "@/lib/access-code-messages";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UploadedInput = {
  fieldName: string;
  file: File;
  kind: "file" | "image" | "signature";
};

type SubmittedContact = ReturnType<typeof extractSubmittedContact>;

function parseSchemaFields(form: { schema?: unknown }) {
  const schema = form.schema && typeof form.schema === "object" ? form.schema : {};
  const fields = Array.isArray((schema as { fields?: unknown }).fields)
    ? (schema as { fields: Record<string, unknown>[] }).fields
    : [];
  return fields.map((field) => ({
    name: String(field.name || "").trim(),
    label: String(field.label || field.name || "").trim(),
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

function dateRangePresent(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const range = value as { checkIn?: unknown; checkOut?: unknown };
  return Boolean(
    String(range.checkIn || "").trim() && String(range.checkOut || "").trim()
  );
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
    if (field.type === "section") continue;
    if (isUploadType(field.type)) {
      if (!uploads.some((upload) => upload.fieldName === field.name)) {
        return `${field.label || field.name} is required.`;
      }
      continue;
    }
    if (field.type === "daterange") {
      if (!dateRangePresent(payload[field.name])) {
        return `${field.label || field.name} is required.`;
      }
      continue;
    }
    if (!valuePresent(payload[field.name])) {
      return `${field.label || field.name} is required.`;
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
      formSlug: String(body.formSlug || body.form_slug || "welcome-to-zenfulcove").trim(),
      submissionId: String(body.submissionId || body.submission_id || "").trim(),
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
    formSlug: String(formData.get("formSlug") || "welcome-to-zenfulcove").trim(),
    submissionId: String(formData.get("submissionId") || "").trim(),
    source: String(formData.get("source") || "local").trim() || "local",
    preview: isTruthy(formData.get("preview")),
    payload,
    uploads,
  };
}

type ParsedSubmission = Awaited<ReturnType<typeof readRequest>>;

function safeLogValue(value: unknown, maxLength = 120) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

function bookingCodeFromPayload(payload?: Record<string, unknown>) {
  if (!payload) return "";
  for (const key of [
    "bookingCode",
    "bookingId",
    "booking_id",
    "confirmationCode",
    "reservationId",
  ]) {
    const value = safeLogValue(payload[key], 80);
    if (value) return value;
  }
  return "";
}

function maskEmail(email?: string) {
  const value = safeLogValue(email, 160);
  const [local, domain] = value.split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, 2)}***@${domain}`;
}

function summarizeUploads(uploads: UploadedInput[] = []) {
  const totalBytes = uploads.reduce((sum, upload) => sum + upload.file.size, 0);
  return {
    count: uploads.length,
    totalBytes,
    fields: uploads.map((upload) => ({
      fieldName: upload.fieldName,
      kind: upload.kind,
      size: upload.file.size,
      contentType: upload.file.type || "application/octet-stream",
    })),
  };
}

async function recordSubmitLog({
  status,
  action,
  formSlug,
  parsed,
  contact,
  submissionId,
  httpStatus,
  error,
}: {
  status: "success" | "failed" | "info";
  action: string;
  formSlug?: string;
  parsed?: ParsedSubmission;
  contact?: SubmittedContact;
  submissionId?: string;
  httpStatus?: number;
  error?: unknown;
}) {
  const payload = parsed?.payload || {};
  const errorMessage =
    error instanceof Error ? error.message : error ? safeLogValue(error) : "";

  try {
    await appendLogs([
      {
        timestamp: new Date().toISOString(),
        automation: "Internal Form Submit",
        property: formSlug || parsed?.formSlug || "unknown form",
        action,
        status,
        formSlug: formSlug || parsed?.formSlug || "",
        source: parsed?.source || "",
        preview: Boolean(parsed?.preview),
        bookingCode: bookingCodeFromPayload(payload),
        email: maskEmail(contact?.email || safeLogValue(payload.email)),
        submissionId: submissionId || "",
        httpStatus: httpStatus || null,
        error: errorMessage,
        uploads: summarizeUploads(parsed?.uploads),
      },
    ]);
  } catch (logErr) {
    const message = logErr instanceof Error ? logErr.message : String(logErr);
    console.warn("[forms-submit] Failed to write submit activity log:", message);
  }
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminEnv()) {
    await recordSubmitLog({
      status: "failed",
      action: "Form submit rejected: local form database is not configured.",
      httpStatus: 503,
    });
    return NextResponse.json(
      { error: "Local form database is not configured yet." },
      { status: 503 }
    );
  }

  let parsed: Awaited<ReturnType<typeof readRequest>>;
  try {
    parsed = await readRequest(request);
  } catch (err) {
    await recordSubmitLog({
      status: "failed",
      action: "Form submit rejected: invalid request payload.",
      httpStatus: 400,
      error: err,
    });
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
  }

  const formSlug = parsed.formSlug;
  if (!formSlug) {
    await recordSubmitLog({
      status: "failed",
      action: "Form submit rejected: missing form slug.",
      parsed,
      httpStatus: 400,
    });
    return NextResponse.json({ error: "Form slug is required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const isTrustedPreview =
    parsed.preview === true &&
    cookieStore.get("zc_admin_auth")?.value === "true";

  const form = await getLocalFormBySlug(formSlug);
  if (!form || (form.is_active === false && !isTrustedPreview)) {
    await recordSubmitLog({
      status: "failed",
      action: "Form submit rejected: form not found or inactive.",
      formSlug,
      parsed,
      httpStatus: 404,
    });
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }
  const resolvedFormSlug = String(form.slug || formSlug).trim();

  const fields = parseSchemaFields(form);
  const requiredError = validateRequiredFields({
    fields,
    payload: parsed.payload,
    uploads: parsed.uploads,
  });
  if (requiredError) {
    await recordSubmitLog({
      status: "failed",
      action: `Form submit rejected: ${requiredError}`,
      formSlug: resolvedFormSlug,
      parsed,
      httpStatus: 400,
    });
    return NextResponse.json({ error: requiredError }, { status: 400 });
  }

  const contact = extractSubmittedContact({ payload: parsed.payload });

  if (contact.email && !EMAIL_RE.test(contact.email)) {
    await recordSubmitLog({
      status: "failed",
      action: "Form submit rejected: invalid email address.",
      formSlug: resolvedFormSlug,
      parsed,
      contact,
      httpStatus: 400,
    });
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  try {
    for (const upload of parsed.uploads) {
      validateLocalFormUpload({
        file: upload.file,
        kind: upload.kind,
      });
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "One of the uploaded files could not be accepted.";
    await recordSubmitLog({
      status: "failed",
      action: `Form submit rejected: ${message}`,
      formSlug: resolvedFormSlug,
      parsed,
      contact,
      httpStatus: 400,
      error: err,
    });
    return NextResponse.json(
      {
        error: message,
      },
      { status: 400 }
    );
  }

  const submittedAt = new Date().toISOString();
  const existingSubmission = parsed.submissionId
    ? await getLocalFormSubmissionById(parsed.submissionId)
    : null;
  const existingPayload =
    existingSubmission?.payload &&
    typeof existingSubmission.payload === "object" &&
    !Array.isArray(existingSubmission.payload)
      ? (existingSubmission.payload as Record<string, unknown>)
      : {};

  if (parsed.submissionId && !isTrustedPreview) {
    await recordSubmitLog({
      status: "failed",
      action: "Form submit rejected: customer submissions are view-only after completion.",
      formSlug: resolvedFormSlug,
      parsed,
      contact,
      httpStatus: 403,
    });
    return NextResponse.json(
      { error: "Submitted reservation forms are view-only." },
      { status: 403 }
    );
  }

  if (parsed.submissionId) {
    if (!existingSubmission || existingSubmission.form_slug !== resolvedFormSlug) {
      await recordSubmitLog({
        status: "failed",
        action: "Form submit rejected: existing submission was not found for this form.",
        formSlug: resolvedFormSlug,
        parsed,
        contact,
        httpStatus: 404,
      });
      return NextResponse.json({ error: "Existing submission not found." }, { status: 404 });
    }
    if (
      existingSubmission.booking_code &&
      contact.bookingCode &&
      !localFormSubmissionMatchesBooking(contact.bookingCode, existingSubmission)
    ) {
      await recordSubmitLog({
        status: "failed",
        action: "Form submit rejected: booking code does not match existing submission.",
        formSlug: resolvedFormSlug,
        parsed,
        contact,
        httpStatus: 403,
      });
      return NextResponse.json(
        { error: "Booking code does not match the existing submission." },
        { status: 403 }
      );
    }
  }

  const submissionPayload = isTrustedPreview
    ? {
        ...existingPayload,
        ...parsed.payload,
        __staffPreview: true,
        __staffPreviewAt: submittedAt,
      }
    : {
        ...existingPayload,
        ...parsed.payload,
      };

  let submission: { id: string; form_slug: string; submitted_at: string };
  let finalSubmissionPayload = submissionPayload;
  try {
    submission = existingSubmission
      ? await updateLocalFormSubmission({
          id: existingSubmission.id,
          form,
          formSlug: resolvedFormSlug,
          contact,
          payload: submissionPayload,
          source: isTrustedPreview ? "staff-preview" : parsed.source,
        })
      : await createLocalFormSubmission({
          form,
          formSlug: resolvedFormSlug,
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
        __files: [
          ...((Array.isArray(existingPayload.__files)
            ? existingPayload.__files
            : []) as unknown[]),
          ...uploadedFiles,
        ],
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
      finalSubmissionPayload = nextPayload;
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not submit the form.";
    await recordSubmitLog({
      status: "failed",
      action: `Form submit failed after validation: ${message}`,
      formSlug: resolvedFormSlug,
      parsed,
      contact,
      httpStatus: 500,
      error: err,
    });
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }

  if (isTrustedPreview) {
    await markLocalFormSubmissionsSynced([submission.id]);
  }

  let accessCodeRelease = null;
  if (!isTrustedPreview) {
    try {
      accessCodeRelease = await maybeSendSameDayAccessCodeForSubmission({
        formSlug: resolvedFormSlug,
        payload: finalSubmissionPayload,
        contact,
      });
    } catch (err) {
      accessCodeRelease = {
        status: "failed",
        action:
          err instanceof Error
            ? err.message
            : "Failed to run same-day access code release.",
      };
      await recordSubmitLog({
        status: "failed",
        action: `Form submitted, but access-code release failed: ${accessCodeRelease.action}`,
        formSlug: resolvedFormSlug,
        parsed,
        contact,
        submissionId: submission.id,
        error: err,
      });
    }
  }

  await recordSubmitLog({
    status: "success",
    action: "Internal form submitted successfully.",
    formSlug: resolvedFormSlug,
    parsed,
    contact,
    submissionId: submission.id,
    httpStatus: 200,
  });

  return NextResponse.json({
    ok: true,
    submissionId: submission.id,
    formSlug: submission.form_slug,
    submittedAt: submission.submitted_at,
    accessCodeRelease,
  });
}
