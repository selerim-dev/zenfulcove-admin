import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

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
      payloadValue(payload, ["bookingCode", "booking_code", "reservationId"]),
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

export async function createLocalFormSubmission({
  form,
  formSlug,
  contact,
  payload,
  source = "local",
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("local_form_submissions")
    .insert({
      form_id: form?.id || null,
      form_slug: form?.slug || formSlug,
      email: contact.email || null,
      first_name: contact.firstName || null,
      last_name: contact.lastName || null,
      phone: contact.phone || null,
      booking_code: contact.bookingCode || null,
      source,
      payload: payload && typeof payload === "object" ? payload : {},
    })
    .select("id, form_slug, submitted_at")
    .single();

  if (error) {
    throw new Error(`Failed to save local form submission: ${error.message}`);
  }

  return data;
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
      "id, form_id, form_slug, email, first_name, last_name, phone, booking_code, payload, sendgrid_synced_at, submitted_at"
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
