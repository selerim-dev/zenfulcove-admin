import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const STAY_MESSAGE_ATTACHMENT_BUCKET = "guest-message-attachments";
export const MAX_STAY_MESSAGE_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const ALLOWED_ATTACHMENT_MIME_TYPES = [
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

async function ensureStayMessageAttachmentBucket(supabase) {
  const { error } = await supabase.storage.getBucket(STAY_MESSAGE_ATTACHMENT_BUCKET);
  if (!error) {
    const { error: updateError } = await supabase.storage.updateBucket(
      STAY_MESSAGE_ATTACHMENT_BUCKET,
      {
        public: false,
        fileSizeLimit: MAX_STAY_MESSAGE_ATTACHMENT_BYTES,
        allowedMimeTypes: ALLOWED_ATTACHMENT_MIME_TYPES,
      }
    );
    if (updateError) {
      throw new Error(`Failed to update message attachment bucket: ${updateError.message}`);
    }
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(
    STAY_MESSAGE_ATTACHMENT_BUCKET,
    {
      public: false,
      fileSizeLimit: MAX_STAY_MESSAGE_ATTACHMENT_BYTES,
      allowedMimeTypes: ALLOWED_ATTACHMENT_MIME_TYPES,
    }
  );

  if (
    createError &&
    !String(createError.message || "").toLowerCase().includes("already exists")
  ) {
    throw new Error(`Failed to create message attachment bucket: ${createError.message}`);
  }
}

function safeFileName(value) {
  const cleaned = String(value || "attachment")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "attachment";
}

function fileExtension(file) {
  const name = String(file?.name || "");
  const fromName = name
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  if (fromName && fromName !== name.toLowerCase()) return fromName;

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
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "docx";
  }
  if (type === "application/vnd.ms-excel") return "xls";
  if (type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return "xlsx";
  }
  return "bin";
}

function validateStayMessageAttachment(file) {
  if (!file || file.size <= 0) {
    throw new Error("Attachment is empty.");
  }
  if (file.size > MAX_STAY_MESSAGE_ATTACHMENT_BYTES) {
    throw new Error("Attachments must be 8MB or smaller.");
  }

  const contentType = String(file.type || "application/octet-stream");
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(contentType)) {
    throw new Error("Attachments must be an image, PDF, text, CSV, Word, or Excel file.");
  }
  return contentType;
}

export async function uploadStayMessageAttachment({ bookingId, file }) {
  const normalizedBookingId = String(bookingId || "").trim();
  if (!normalizedBookingId) throw new Error("Missing booking ID for attachment.");

  const contentType = validateStayMessageAttachment(file);
  const supabase = createSupabaseAdminClient();
  await ensureStayMessageAttachmentBucket(supabase);

  const originalName = safeFileName(file.name || `attachment.${fileExtension(file)}`);
  const path = `${safeFileName(normalizedBookingId)}/${randomUUID()}.${fileExtension(file)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from(STAY_MESSAGE_ATTACHMENT_BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Attachment upload failed: ${error.message}`);
  }

  return {
    fileName: originalName,
    path,
    bucket: STAY_MESSAGE_ATTACHMENT_BUCKET,
    contentType,
    size: file.size,
  };
}

export async function signStayMessageAttachment(attachment, expiresIn = 60 * 60 * 24 * 30) {
  const path = String(attachment?.path || "").trim();
  if (!path) return attachment;

  const bucket = String(attachment.bucket || STAY_MESSAGE_ATTACHMENT_BUCKET).trim();
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  return {
    ...attachment,
    signedUrl: data?.signedUrl || "",
  };
}

export async function signStayMessageAttachments(attachments = []) {
  return Promise.all(
    (attachments || [])
      .filter(Boolean)
      .map((attachment) => signStayMessageAttachment(attachment).catch(() => attachment))
  );
}
