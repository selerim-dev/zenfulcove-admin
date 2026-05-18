import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  createJervisReservation,
  extractJervisPincode,
  extractJervisReservationId,
  getJervisReservation,
  isJervisConfigured,
  jervisReservationPayload,
  resolveJervisPropertyId,
  updateJervisReservation,
} from "@/lib/jervis";

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

function normalizeLookupKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function lookupPropertyCode(propertyCodes, booking) {
  const propertyId = clean(booking.propertyId);
  const propertyName = clean(booking.propertyName);
  const exact = propertyCodes[propertyId] || propertyCodes[propertyName];
  if (exact) return exact;

  const targetKeys = [propertyId, propertyName]
    .map(normalizeLookupKey)
    .filter(Boolean);
  for (const [key, code] of Object.entries(propertyCodes)) {
    const normalizedKey = normalizeLookupKey(key);
    if (
      targetKeys.some(
        (target) =>
          target === normalizedKey ||
          target.includes(normalizedKey) ||
          normalizedKey.includes(target)
      )
    ) {
      return code;
    }
  }

  return "";
}

const DIRECT_ACCESS_CODE_KEYS = new Set([
  "keycode",
  "key_code",
  "accesscode",
  "access_code",
  "doorcode",
  "door_code",
  "lockcode",
  "lock_code",
  "pincode",
  "pin_code",
]);

const CONTEXT_ACCESS_CODE_KEYS = new Set([
  "code",
  "pin",
  "value",
]);

function isUsableAccessCodeValue(value) {
  const normalized = clean(value);
  if (!normalized) return false;
  if (normalized.length < 3 || normalized.length > 30) return false;
  if (/@|https?:\/\//i.test(normalized)) return false;
  return true;
}

function normalizedObjectKey(key) {
  return clean(key).replace(/[\s-]/g, "_").toLowerCase();
}

function pathHasAccessContext(path) {
  return path.some((part) =>
    /(key|access|door|lock|pin|smart.?lock|jervis)/i.test(clean(part))
  );
}

export function extractAccessCodeFromLodgifyBooking(booking) {
  const seen = new Set();
  const queue = [{ value: booking, path: [] }];

  while (queue.length > 0) {
    const { value, path } = queue.shift();
    if (!value || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, index) => queue.push({ value: item, path: [...path, index] }));
      continue;
    }

    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = normalizedObjectKey(key);
      const childPath = [...path, key];
      const isDirectKey = DIRECT_ACCESS_CODE_KEYS.has(normalizedKey);
      const isContextualKey =
        CONTEXT_ACCESS_CODE_KEYS.has(normalizedKey) && pathHasAccessContext(path);

      if (
        (isDirectKey || isContextualKey) &&
        (typeof child === "string" || typeof child === "number") &&
        isUsableAccessCodeValue(child)
      ) {
        return {
          accessCode: clean(child),
          fieldPath: childPath.map(String).join("."),
        };
      }

      if (child && typeof child === "object") {
        queue.push({ value: child, path: childPath });
      }
    }
  }

  return null;
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
    raw_source: {
      ...(existing?.raw_source && typeof existing.raw_source === "object"
        ? existing.raw_source
        : {}),
      ...(raw && typeof raw === "object" ? raw : {}),
    },
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

async function upsertAccessCodeReleaseMetadata({
  bookingId,
  propertyId = "",
  propertyName = "",
  guestEmail = "",
  guestName = "",
  checkinDate = "",
  source = "unknown",
  raw = {},
}) {
  const normalizedBookingId = normalizeBookingId(bookingId);
  if (!normalizedBookingId) {
    throw new Error("Cannot save access code metadata without a booking ID.");
  }

  const existing = await getAccessCodeRelease(normalizedBookingId);
  const row = {
    booking_id: normalizedBookingId,
    property_id: clean(propertyId) || existing?.property_id || null,
    property_name: clean(propertyName) || existing?.property_name || null,
    guest_email: clean(guestEmail).toLowerCase() || existing?.guest_email || null,
    guest_name: clean(guestName) || existing?.guest_name || null,
    checkin_date: clean(checkinDate) || existing?.checkin_date || null,
    access_code: existing?.access_code || null,
    source: clean(source) || existing?.source || "unknown",
    status: existing?.sent_at ? existing.status : existing?.status || "pending",
    raw_source: {
      ...(existing?.raw_source && typeof existing.raw_source === "object"
        ? existing.raw_source
        : {}),
      ...(raw && typeof raw === "object" ? raw : {}),
    },
    last_error: existing?.last_error || null,
  };

  const supabase = createSupabaseAdminClient();
  if (!existing) {
    const { data, error } = await supabase
      .from("access_code_releases")
      .insert(row)
      .select("*")
      .single();
    if (error) {
      throw new Error(`Failed to save access code metadata: ${error.message}`);
    }
    return data;
  }

  const { data, error } = await supabase
    .from("access_code_releases")
    .update(row)
    .eq("booking_id", normalizedBookingId)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update access code metadata: ${error.message}`);
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

function existingJervisReservationId(row) {
  const raw = row?.raw_source && typeof row.raw_source === "object" ? row.raw_source : {};
  return clean(
    raw.jervisReservationId ||
      raw.jervis_reservation_id ||
      raw.reservationId ||
      raw.jervis?.reservationId ||
      raw.jervis?.reservation_id
  );
}

async function fetchJervisDirectAccessCode(booking, config = {}, existing = null) {
  if (!isJervisConfigured(config)) return null;

  let jervisReservationId = existingJervisReservationId(existing);
  let jervisPropertyId = clean(existing?.raw_source?.jervisPropertyId);
  let jervisPropertySource = clean(existing?.raw_source?.jervisPropertySource);
  let createResponse = null;

  if (!jervisReservationId) {
    const resolvedProperty = await resolveJervisPropertyId(booking, config);
    jervisPropertyId = resolvedProperty.propertyId;
    jervisPropertySource = resolvedProperty.source;
    if (!jervisPropertyId) return null;

    const payload = jervisReservationPayload(booking, config);
    if (!payload.email || !payload.start_date || !payload.end_date) {
      throw new Error(
        "Jervis reservation requires guest email, check-in date, and check-out date."
      );
    }

    createResponse = await createJervisReservation(jervisPropertyId, payload, config);
    jervisReservationId = extractJervisReservationId(createResponse);
    if (!jervisReservationId) {
      throw new Error("Jervis reservation was created but no reservation ID was returned.");
    }

    await upsertAccessCodeReleaseMetadata({
      bookingId: booking.bookingId,
      propertyId: booking.propertyId,
      propertyName: booking.propertyName,
      guestEmail: booking.guestEmail,
      guestName: booking.guestName,
      checkinDate: booking.checkinDate,
      source: "jervis-direct-api",
      raw: {
        jervisReservationId,
        jervisPropertyId,
        jervisPropertySource,
        jervisCreateResponse: createResponse,
      },
    });
  } else {
    const payload = jervisReservationPayload(booking, config);
    if (payload.email && payload.start_date && payload.end_date) {
      await updateJervisReservation(jervisReservationId, payload, config);
    }
  }

  const reservation = await getJervisReservation(jervisReservationId, config);
  const pincode = extractJervisPincode(reservation);
  if (!pincode) {
    throw new Error(`Jervis reservation ${jervisReservationId} did not return a pincode.`);
  }

  return {
    bookingId: booking.bookingId,
    accessCode: pincode,
    propertyId: booking.propertyId,
    propertyName: booking.propertyName,
    guestEmail: booking.guestEmail,
    guestName: booking.guestName,
    checkinDate: booking.checkinDate,
    source: "jervis-direct-api",
    raw: {
      jervisReservationId,
      jervisPropertyId,
      jervisPropertySource,
      jervisCreateResponse: createResponse || undefined,
      jervisReservation: reservation,
    },
  };
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
  const propertyCode = lookupPropertyCode(propertyCodes, booking);
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

  const jervisDirectPayload = await fetchJervisDirectAccessCode(
    booking,
    config,
    existing
  );
  if (jervisDirectPayload?.accessCode) {
    const row = await upsertAccessCodeRelease({
      ...jervisDirectPayload,
      propertyId: jervisDirectPayload.propertyId || booking.propertyId,
      propertyName: jervisDirectPayload.propertyName || booking.propertyName,
      guestEmail: jervisDirectPayload.guestEmail || booking.guestEmail,
      guestName: jervisDirectPayload.guestName || booking.guestName,
      checkinDate: jervisDirectPayload.checkinDate || booking.checkinDate,
    });
    return { code: row.access_code, source: row.source, row };
  }

  const lodgifyCode = extractAccessCodeFromLodgifyBooking(
    booking.lodgifyBooking || booking.rawBooking || booking.raw
  );
  if (lodgifyCode?.accessCode) {
    const row = await upsertAccessCodeRelease({
      bookingId,
      accessCode: lodgifyCode.accessCode,
      propertyId: booking.propertyId,
      propertyName: booking.propertyName,
      guestEmail: booking.guestEmail,
      guestName: booking.guestName,
      checkinDate: booking.checkinDate,
      source: "lodgify-booking-payload",
      raw: {
        fieldPath: lodgifyCode.fieldPath,
        propertyId: booking.propertyId,
        propertyName: booking.propertyName,
      },
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

export async function markAccessCodeReleaseBlocked({
  bookingId,
  propertyId = "",
  propertyName = "",
  guestEmail = "",
  guestName = "",
  checkinDate = "",
  templateId = "",
  error = "Form not submitted yet.",
  raw = {},
}) {
  const normalizedBookingId = normalizeBookingId(bookingId);
  if (!normalizedBookingId) return null;

  const existing = await getAccessCodeRelease(normalizedBookingId);
  if (existing?.sent_at || existing?.status === "sent") {
    return existing;
  }

  const row = {
    booking_id: normalizedBookingId,
    property_id: clean(propertyId) || existing?.property_id || null,
    property_name: clean(propertyName) || existing?.property_name || null,
    guest_email: clean(guestEmail).toLowerCase() || existing?.guest_email || null,
    guest_name: clean(guestName) || existing?.guest_name || null,
    checkin_date: clean(checkinDate) || existing?.checkin_date || null,
    access_code: existing?.access_code || null,
    source: existing?.source || "form-gate",
    status: "blocked",
    channel: "email",
    sendgrid_template_id: clean(templateId) || existing?.sendgrid_template_id || null,
    last_attempt_at: new Date().toISOString(),
    last_error: clean(error).slice(0, 1000) || "Form not submitted yet.",
    raw_source: {
      ...(existing?.raw_source && typeof existing.raw_source === "object"
        ? existing.raw_source
        : {}),
      ...(raw && typeof raw === "object" ? raw : {}),
    },
  };

  const supabase = createSupabaseAdminClient();
  if (!existing) {
    const { data, error: insertError } = await supabase
      .from("access_code_releases")
      .insert(row)
      .select("*")
      .single();

    if (insertError) {
      throw new Error(`Failed to save blocked access code release: ${insertError.message}`);
    }

    return data;
  }

  const { data, error: updateError } = await supabase
    .from("access_code_releases")
    .update(row)
    .eq("booking_id", normalizedBookingId)
    .select("*")
    .single();

  if (updateError) {
    throw new Error(`Failed to update blocked access code release: ${updateError.message}`);
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
