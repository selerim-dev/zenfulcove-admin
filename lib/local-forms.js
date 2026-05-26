import { randomUUID } from "node:crypto";
import { bookingCodesMatch } from "@/lib/booking-code";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const LOCAL_FORM_UPLOAD_BUCKET = "local-form-uploads";
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").trim();
}

function firstNonEmpty(values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function splitName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function payloadValue(payload, keys) {
  for (const key of keys) {
    const direct = payload?.[key];
    if (direct !== undefined && direct !== null && String(direct).trim()) {
      return direct;
    }
  }
  return "";
}

export function extractSubmittedContact(input = {}) {
  const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
  const derivedName = splitName(
    firstNonEmpty([
      input.fullName,
      input.full_name,
      payloadValue(payload, ["fullName", "full_name", "name", "customerName"]),
    ])
  );

  return {
    email: normalizeEmail(
      firstNonEmpty([
        input.email,
        payloadValue(payload, ["email", "emailAddress", "customerEmail"]),
      ])
    ),
    firstName: firstNonEmpty([
      input.firstName,
      input.first_name,
      payloadValue(payload, ["firstName", "first_name"]),
      derivedName.firstName,
    ]),
    lastName: firstNonEmpty([
      input.lastName,
      input.last_name,
      payloadValue(payload, ["lastName", "last_name"]),
      derivedName.lastName,
    ]),
    phone: normalizePhone(
      firstNonEmpty([
        input.phone,
        input.phoneNumber,
        payloadValue(payload, ["phone", "phoneNumber", "mobile", "customerPhone"]),
      ])
    ),
    bookingCode: firstNonEmpty([
      input.bookingCode,
      input.booking_code,
      input.reservationId,
      input.reservation_id,
      input.bookingConfirmationId,
      input.booking_confirmation_id,
      input.confirmationId,
      input.confirmation_id,
      payloadValue(payload, [
        "bookingCode",
        "booking_code",
        "bookingConfirmationId",
        "booking_confirmation_id",
        "confirmationId",
        "confirmation_id",
        "reservationId",
        "reservation_id",
      ]),
    ]),
  };
}

export function extractLocalFormContact(row = {}) {
  return {
    email: normalizeEmail(row.email),
    firstName: String(row.first_name || "").trim(),
    lastName: String(row.last_name || "").trim(),
    phone: normalizePhone(row.phone),
    submissionId: String(row.id || "").trim(),
    formSlug: String(row.form_slug || "").trim(),
    createdAt: row.submitted_at || "",
  };
}

export async function getLocalFormBySlug(slug) {
  const normalizedSlug = String(slug || "").trim();
  if (!normalizedSlug) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("local_forms")
    .select("*")
    .eq("slug", normalizedSlug)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load local form ${normalizedSlug}: ${error.message}`);
  }

  return data || null;
}

export async function listPublishedLocalFormsForNav() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("local_forms")
    .select("slug, name")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load published local forms: ${error.message}`);
  }

  return (data || [])
    .map((form) => ({
      slug: String(form.slug || "").trim(),
      name: String(form.name || "").trim(),
    }))
    .filter((form) => form.slug && form.name);
}

export async function createLocalFormSubmission({
  form,
  formSlug,
  contact,
  payload,
  source = "local",
  externalSource = null,
  externalFormId = null,
  externalSubmissionId = null,
  submittedAt = null,
}) {
  const supabase = createSupabaseAdminClient();
  const row = {
    form_id: form?.id || null,
    form_slug: form?.slug || formSlug,
    email: contact.email || null,
    first_name: contact.firstName || null,
    last_name: contact.lastName || null,
    phone: contact.phone || null,
    booking_code: contact.bookingCode || null,
    source,
    payload: payload && typeof payload === "object" ? payload : {},
    external_source: externalSource || null,
    external_form_id: externalFormId || null,
    external_submission_id: externalSubmissionId || null,
  };
  if (submittedAt) row.submitted_at = submittedAt;

  const { data, error } = await supabase
    .from("local_form_submissions")
    .insert(row)
    .select("id, form_slug, submitted_at")
    .single();

  if (error) {
    throw new Error(`Failed to save local form submission: ${error.message}`);
  }

  return data;
}

export async function getLocalFormSubmissionById(id) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("local_form_submissions")
    .select(
      "id, form_id, form_slug, email, first_name, last_name, phone, booking_code, payload, sendgrid_synced_at, submitted_at, external_source, external_form_id, external_submission_id"
    )
    .eq("id", normalizedId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load local form submission: ${error.message}`);
  }

  return data || null;
}

export async function updateLocalFormSubmission({
  id,
  form,
  formSlug,
  contact,
  payload,
  source = "local",
}) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("Missing local form submission ID.");

  const row = {
    form_id: form?.id || null,
    form_slug: form?.slug || formSlug,
    email: contact.email || null,
    first_name: contact.firstName || null,
    last_name: contact.lastName || null,
    phone: contact.phone || null,
    booking_code: contact.bookingCode || null,
    source,
    payload: payload && typeof payload === "object" ? payload : {},
  };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("local_form_submissions")
    .update(row)
    .eq("id", normalizedId)
    .select("id, form_slug, submitted_at")
    .single();

  if (error) {
    throw new Error(`Failed to update local form submission: ${error.message}`);
  }

  return data;
}

export async function upsertImportedLocalFormSubmission({
  form,
  formSlug,
  contact,
  payload,
  externalSource,
  externalFormId,
  externalSubmissionId,
  submittedAt,
}) {
  const normalizedExternalSource = String(externalSource || "").trim();
  const normalizedExternalFormId = String(externalFormId || "").trim();
  const normalizedExternalSubmissionId = String(externalSubmissionId || "").trim();
  if (
    !normalizedExternalSource ||
    !normalizedExternalFormId ||
    !normalizedExternalSubmissionId
  ) {
    throw new Error("Imported submissions require external source, form ID, and submission ID.");
  }

  const supabase = createSupabaseAdminClient();
  const row = {
    form_id: form?.id || null,
    form_slug: form?.slug || formSlug,
    email: contact.email || null,
    first_name: contact.firstName || null,
    last_name: contact.lastName || null,
    phone: contact.phone || null,
    booking_code: contact.bookingCode || null,
    source: normalizedExternalSource,
    payload: payload && typeof payload === "object" ? payload : {},
    external_source: normalizedExternalSource,
    external_form_id: normalizedExternalFormId,
    external_submission_id: normalizedExternalSubmissionId,
  };
  if (submittedAt) row.submitted_at = submittedAt;

  const { data: existingRows, error: lookupError } = await supabase
    .from("local_form_submissions")
    .select("id")
    .eq("external_source", normalizedExternalSource)
    .eq("external_form_id", normalizedExternalFormId)
    .eq("external_submission_id", normalizedExternalSubmissionId)
    .order("submitted_at", { ascending: false })
    .limit(1);

  if (lookupError) {
    throw new Error(`Failed to check imported local form submission: ${lookupError.message}`);
  }

  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  const query = existing
    ? supabase
        .from("local_form_submissions")
        .update(row)
        .eq("id", existing.id)
    : supabase.from("local_form_submissions").insert(row);

  const { data, error } = await query
    .select("id, form_slug, submitted_at")
    .single();

  if (error) {
    throw new Error(`Failed to import local form submission: ${error.message}`);
  }

  return data;
}

export async function updateLocalFormSubmissionPayload(id, payload) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("local_form_submissions")
    .update({ payload: payload && typeof payload === "object" ? payload : {} })
    .eq("id", normalizedId);

  if (error) {
    throw new Error(`Failed to update local form submission: ${error.message}`);
  }
}

async function ensureLocalFormUploadBucket(supabase) {
  const { error } = await supabase.storage.getBucket(LOCAL_FORM_UPLOAD_BUCKET);
  if (!error) {
    const { error: updateError } = await supabase.storage.updateBucket(
      LOCAL_FORM_UPLOAD_BUCKET,
      {
        public: false,
        fileSizeLimit: MAX_UPLOAD_BYTES,
        allowedMimeTypes: ALLOWED_UPLOAD_MIME_TYPES,
      }
    );
    if (updateError) {
      throw new Error(`Failed to update upload bucket: ${updateError.message}`);
    }
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(
    LOCAL_FORM_UPLOAD_BUCKET,
    {
      public: false,
      fileSizeLimit: MAX_UPLOAD_BYTES,
      allowedMimeTypes: ALLOWED_UPLOAD_MIME_TYPES,
    }
  );

  if (
    createError &&
    !String(createError.message || "").toLowerCase().includes("already exists")
  ) {
    throw new Error(`Failed to create upload bucket: ${createError.message}`);
  }
}

function safeFileName(value) {
  const cleaned = String(value || "upload")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "upload";
}

function fileExtension(file) {
  const fromName = String(file?.name || "")
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  if (fromName && fromName !== String(file?.name || "").toLowerCase()) {
    return fromName;
  }

  const type = String(file?.type || "").toLowerCase();
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/heic") return "heic";
  if (type === "image/heif") return "heif";
  if (type === "application/pdf") return "pdf";
  if (type === "text/plain") return "txt";
  if (type === "text/csv") return "csv";
  if (type === "application/msword") return "doc";
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (type === "application/vnd.ms-excel") return "xls";
  if (
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "xlsx";
  }
  return "bin";
}

export function validateLocalFormUpload({ file, kind }) {
  if (!file || file.size <= 0) {
    throw new Error("Upload is empty.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Uploads must be 4MB or smaller.");
  }

  const contentType = String(file.type || "application/octet-stream");
  if ((kind === "image" || kind === "signature") && !contentType.startsWith("image/")) {
    throw new Error("Image and signature fields only accept image files.");
  }
  if (kind === "file" && !ALLOWED_UPLOAD_MIME_TYPES.includes(contentType)) {
    throw new Error("File uploads must be an image, PDF, text, CSV, Word, or Excel file.");
  }
  return contentType;
}

export async function uploadLocalFormFile({
  formSlug,
  submissionId,
  fieldName,
  file,
  kind = "file",
}) {
  const normalizedFormSlug = String(formSlug || "form").trim() || "form";
  const normalizedSubmissionId = String(submissionId || "").trim();
  const normalizedFieldName = String(fieldName || "upload").trim() || "upload";
  if (!normalizedSubmissionId) throw new Error("Missing submission id.");

  const contentType = validateLocalFormUpload({ file, kind });
  const supabase = createSupabaseAdminClient();
  await ensureLocalFormUploadBucket(supabase);

  const originalName = safeFileName(file.name || `${normalizedFieldName}.${fileExtension(file)}`);
  const ext = fileExtension(file);
  const path = `${normalizedFormSlug}/${normalizedSubmissionId}/${normalizedFieldName}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(LOCAL_FORM_UPLOAD_BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed for ${normalizedFieldName}: ${error.message}`);
  }

  return {
    fieldName: normalizedFieldName,
    kind,
    fileName: originalName,
    path,
    bucket: LOCAL_FORM_UPLOAD_BUCKET,
    contentType,
    size: file.size,
  };
}

export async function signLocalFormUpload(file, expiresIn = 60 * 60) {
  const path = String(file?.path || "").trim();
  if (!path) return file;

  const bucket = String(file.bucket || LOCAL_FORM_UPLOAD_BUCKET).trim();
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  return {
    ...file,
    signedUrl: data?.signedUrl || "",
  };
}

export async function listLocalFormSubmissions({
  formSlugs = [],
  onlyUnsynced = false,
  limit = 5000,
} = {}) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("local_form_submissions")
    .select(
      "id, form_id, form_slug, email, first_name, last_name, phone, booking_code, payload, sendgrid_synced_at, submitted_at, external_source, external_form_id, external_submission_id"
    )
    .order("submitted_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 5000, 10000)));

  const slugs = (formSlugs || [])
    .map((slug) => String(slug || "").trim())
    .filter(Boolean);

  if (slugs.length > 0) {
    query = query.in("form_slug", slugs);
  }

  if (onlyUnsynced) {
    query = query.is("sendgrid_synced_at", null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load local form submissions: ${error.message}`);
  }

  return data || [];
}

function localFormSubmissionBookingValues(submission = {}) {
  const payload =
    submission.payload && typeof submission.payload === "object"
      ? submission.payload
      : {};

  return [
    submission.booking_code,
    payload.bookingCode,
    payload.booking_code,
    payload.bookingConfirmationId,
    payload.booking_confirmation_id,
    payload.confirmationId,
    payload.confirmation_id,
    payload.reservationId,
    payload.reservation_id,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

export function localFormSubmissionMatchesBooking(bookingId, submission) {
  const normalizedBookingId = String(bookingId || "").trim();
  if (!normalizedBookingId) return false;

  return localFormSubmissionBookingValues(submission).some(
    (value) => bookingCodesMatch(value, normalizedBookingId)
  );
}

export function bookingHasLocalFormSubmission(bookingId, submissions = []) {
  return (submissions || []).some((submission) =>
    localFormSubmissionMatchesBooking(bookingId, submission)
  );
}

/**
 * @param {{ formSlug?: string; bookingId?: string; limit?: number }} options
 */
export async function findLocalFormSubmissionForBooking({
  formSlug,
  bookingId,
  limit = 10000,
} = {}) {
  const normalizedFormSlug = String(formSlug || "").trim();
  const normalizedBookingId = String(bookingId || "").trim();
  if (!normalizedFormSlug || !normalizedBookingId) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("local_form_submissions")
    .select(
      "id, form_id, form_slug, email, first_name, last_name, phone, booking_code, payload, sendgrid_synced_at, submitted_at, external_source, external_form_id, external_submission_id"
    )
    .eq("form_slug", normalizedFormSlug)
    .order("submitted_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 10000, 10000)));

  if (error) {
    throw new Error(`Failed to load local form submission for booking: ${error.message}`);
  }

  return (
    (data || []).find((submission) =>
      localFormSubmissionMatchesBooking(normalizedBookingId, submission)
    ) || null
  );
}

export async function markLocalFormSubmissionsSynced(submissionIds = []) {
  const ids = Array.from(
    new Set(
      (submissionIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );

  if (ids.length === 0) return;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("local_form_submissions")
    .update({ sendgrid_synced_at: new Date().toISOString() })
    .in("id", ids);

  if (error) {
    throw new Error(`Failed to mark local form submissions synced: ${error.message}`);
  }
}
