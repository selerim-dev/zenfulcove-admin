import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

function clean(value) {
  return String(value || "").trim();
}

function normalizeBookingId(value) {
  return clean(value);
}

function normalizePropertyCodeMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, code]) => [clean(key), clean(code)])
      .filter(([key, code]) => key && code)
  );
}

export function extractAccessCodeWebhookPayload(body = {}) {
  const bookingId = normalizeBookingId(
    body.bookingId ||
      body.booking_id ||
      body.reservationId ||
      body.reservation_id ||
      body.lodgifyReservationId ||
      body.lodgify_reservation_id
  );
  const accessCode = clean(
    body.accessCode ||
      body.access_code ||
      body.doorCode ||
      body.door_code ||
      body.lockCode ||
      body.lock_code ||
      body.code
  );

  return {
    bookingId,
    accessCode,
    propertyId: clean(body.propertyId || body.property_id),
    propertyName: clean(body.propertyName || body.property_name),
    guestEmail: clean(body.guestEmail || body.guest_email).toLowerCase(),
    guestName: clean(body.guestName || body.guest_name),
    checkinDate: clean(body.checkinDate || body.checkin_date || body.arrival),
    source: clean(body.source) || "jervis-webhook",
    raw: body && typeof body === "object" ? body : {},
  };
}

export async function getAccessCodeRelease(bookingId) {
  const normalizedBookingId = normalizeBookingId(bookingId);
  if (!normalizedBookingId) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("access_code_releases")
    .select("*")
    .eq("booking_id", normalizedBookingId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load access code release: ${error.message}`);
  }

  return data || null;
}

export async function upsertAccessCodeRelease({
  bookingId,
  accessCode,
  propertyId = "",
  propertyName = "",
  guestEmail = "",
  guestName = "",
  checkinDate = "",
  source = "unknown",
  raw = {},
}) {
  const normalizedBookingId = normalizeBookingId(bookingId);
  const normalizedAccessCode = clean(accessCode);
  if (!normalizedBookingId) {
    throw new Error("Cannot save access code without a booking ID.");
  }
  if (!normalizedAccessCode) {
    throw new Error("Cannot save access code without a code value.");
  }

  const existing = await getAccessCodeRelease(normalizedBookingId);
  const supabase = createSupabaseAdminClient();
  const row = {
    booking_id: normalizedBookingId,
    property_id: clean(propertyId) || existing?.property_id || null,
    property_name: clean(propertyName) || existing?.property_name || null,
    guest_email: clean(guestEmail).toLowerCase() || existing?.guest_email || null,
    guest_name: clean(guestName) || existing?.guest_name || null,
    checkin_date: clean(checkinDate) || existing?.checkin_date || null,
    access_code: normalizedAccessCode,
    source: clean(source) || existing?.source || "unknown",
    raw_source: raw && typeof raw === "object" ? raw : {},
    last_error: null,
  };

  if (!existing) {
    const { data, error } = await supabase
      .from("access_code_releases")
      .insert(row)
      .select("*")
      .single();
    if (error) {
      throw new Error(`Failed to save access code release: ${error.message}`);
    }
    return data;
  }

  const update = {
    ...row,
    status: existing.sent_at ? existing.status : "pending",
  };
  const { data, error } = await supabase
    .from("access_code_releases")
    .update(update)
    .eq("booking_id", normalizedBookingId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update access code release: ${error.message}`);
  }

  return data;
}

async function fetchJervisAccessCode(booking, config = {}) {
  const endpoint = clean(
    config.jervisAccessCodeApiUrl || process.env.JERVIS_ACCESS_CODE_API_URL
  );
  if (!endpoint) return null;

  const token = clean(config.jervisApiToken || process.env.JERVIS_API_TOKEN);
  const body = {
    bookingId: clean(booking.bookingId),
    propertyId: clean(booking.propertyId),
    propertyName: clean(booking.propertyName),
    guestEmail: clean(booking.guestEmail).toLowerCase(),
    checkinDate: clean(booking.checkinDate),
  };
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      `Jervis code lookup failed: ${response.status} ${response.statusText} ${text.slice(0, 200)}`
    );
  }

  const parsed = extractAccessCodeWebhookPayload({
    ...data,
    bookingId: data.bookingId || data.booking_id || body.bookingId,
    propertyId: data.propertyId || data.property_id || body.propertyId,
    propertyName: data.propertyName || data.property_name || body.propertyName,
    guestEmail: data.guestEmail || data.guest_email || body.guestEmail,
    checkinDate: data.checkinDate || data.checkin_date || body.checkinDate,
    source: data.source || "jervis-api",
  });
  if (!parsed.accessCode) return null;
  return parsed;
}

export async function resolveAccessCodeForBooking(booking, config = {}) {
  const bookingId = normalizeBookingId(booking.bookingId);
  if (!bookingId) return { code: "", source: "", row: null };

  const existing = await getAccessCodeRelease(bookingId);
  if (existing?.access_code) {
    return {
      code: existing.access_code,
      source: existing.source || "stored",
      row: existing,
    };
  }

  const propertyCodes = normalizePropertyCodeMap(
    config.propertyCodes || config.staticCodesByProperty
  );
  const propertyCode =
    propertyCodes[clean(booking.propertyId)] ||
    propertyCodes[clean(booking.propertyName)];
  if (propertyCode) {
    const row = await upsertAccessCodeRelease({
      bookingId,
      accessCode: propertyCode,
      propertyId: booking.propertyId,
      propertyName: booking.propertyName,
      guestEmail: booking.guestEmail,
      guestName: booking.guestName,
      checkinDate: booking.checkinDate,
      source: "property-code-config",
      raw: { propertyId: booking.propertyId, propertyName: booking.propertyName },
    });
    return { code: row.access_code, source: row.source, row };
  }

  const jervisPayload = await fetchJervisAccessCode(booking, config);
  if (jervisPayload?.accessCode) {
    const row = await upsertAccessCodeRelease({
      ...jervisPayload,
      propertyId: jervisPayload.propertyId || booking.propertyId,
      propertyName: jervisPayload.propertyName || booking.propertyName,
      guestEmail: jervisPayload.guestEmail || booking.guestEmail,
      guestName: jervisPayload.guestName || booking.guestName,
      checkinDate: jervisPayload.checkinDate || booking.checkinDate,
    });
    return { code: row.access_code, source: row.source, row };
  }

  return { code: "", source: "", row: existing };
}

export async function markAccessCodeReleaseSent({
  bookingId,
  templateId,
  channel = "email",
}) {
  const normalizedBookingId = normalizeBookingId(bookingId);
  if (!normalizedBookingId) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("access_code_releases")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      last_attempt_at: new Date().toISOString(),
      last_error: null,
      channel,
      sendgrid_template_id: clean(templateId) || null,
    })
    .eq("booking_id", normalizedBookingId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to mark access code sent: ${error.message}`);
  }

  return data;
}

export async function markAccessCodeReleaseFailed({
  bookingId,
  error,
  status = "failed",
}) {
  const normalizedBookingId = normalizeBookingId(bookingId);
  if (!normalizedBookingId) return null;

  const supabase = createSupabaseAdminClient();
  const { data, error: updateError } = await supabase
    .from("access_code_releases")
    .update({
      status,
      last_attempt_at: new Date().toISOString(),
      last_error: clean(error).slice(0, 1000) || "Unknown error",
    })
    .eq("booking_id", normalizedBookingId)
    .select("*")
    .maybeSingle();

  if (updateError) {
    throw new Error(`Failed to mark access code failure: ${updateError.message}`);
  }

  return data || null;
}
