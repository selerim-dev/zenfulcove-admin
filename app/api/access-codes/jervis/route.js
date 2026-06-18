import { NextResponse } from "next/server";
import { getConfig } from "@/lib/kv";
import { appendLogs } from "@/lib/activity-log";
import {
  extractAccessCodeWebhookPayload,
  getAccessCodeReleaseByJervisReservationId,
  upsertAccessCodeRelease,
} from "@/lib/access-code-releases";
import { sendAccessCodeForBooking } from "@/lib/access-code-messages";
import {
  extractLocalFormContact,
  findLocalFormSubmissionForBooking,
} from "@/lib/local-forms";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";

function clean(value) {
  return String(value || "").trim();
}

function authorized(request) {
  const secret = String(
    process.env.JERVIS_WEBHOOK_SECRET || process.env.CRON_SECRET || ""
  ).trim();
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Jervis webhook secret is not configured." },
        { status: 503 }
      ),
    };
  }

  const auth = request.headers.get("authorization") || "";
  const headerSecret = request.headers.get("x-jervis-secret") || "";
  if (auth === `Bearer ${secret}` || headerSecret === secret) {
    return { ok: true };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

function incomingJervisReservationId(body = {}) {
  return clean(
    body.jervisReservationId ||
      body.jervis_reservation_id ||
      body.reservationUuid ||
      body.reservation_uuid ||
      body.reservationId ||
      body.reservation_id ||
      body.id
  );
}

function dateOnly(value) {
  const raw = clean(value);
  if (!raw) return "";
  return raw.slice(0, 10);
}

function releaseBookingFromRow(row = {}) {
  const raw = row.raw_source && typeof row.raw_source === "object" ? row.raw_source : {};
  const jervisReservation =
    raw.jervisReservation && typeof raw.jervisReservation === "object"
      ? raw.jervisReservation
      : {};
  const nameParts = clean(row.guest_name).split(/\s+/).filter(Boolean);
  return {
    id: row.booking_id,
    status: "Booked",
    property_id: row.property_id,
    property_name: row.property_name,
    arrival: row.checkin_date || dateOnly(jervisReservation.access_start_time),
    departure: dateOnly(jervisReservation.access_end_time),
    guest: {
      name: row.guest_name || "Guest",
      firstName: nameParts[0] || "Guest",
      lastName: nameParts.slice(1).join(" "),
      email: row.guest_email,
    },
  };
}

async function maybePostConfiguredLodgifyMessage(row) {
  const config = await getConfig();
  const releaseConfig = config.accessCodeRelease || {};
  const waiverConfig = config.waiverReminders || {};
  const formSlug = clean(
    releaseConfig.localFormSlug ||
      waiverConfig.localFormSlug ||
      waiverConfig.formSlug ||
      "welcome-to-zenfulcove"
  ).replace(/^\/?forms\//, "");

  if (!releaseConfig.enabled) {
    return { status: "skipped", action: "Access-code release disabled" };
  }
  if (row.sent_at || row.status === "sent") {
    return { status: "skipped", action: `Booking ${row.booking_id} already sent` };
  }
  if (!row.access_code) {
    return { status: "skipped", action: `Booking ${row.booking_id} has no access code yet` };
  }

  const submission = formSlug
    ? await findLocalFormSubmissionForBooking({
        formSlug,
        bookingId: row.booking_id,
      })
    : null;
  if (!submission) {
    return {
      status: "skipped",
      action: `Booking ${row.booking_id} has no completed internal form`,
    };
  }

  return sendAccessCodeForBooking({
    booking: releaseBookingFromRow(row),
    automationConfig: config,
    fallback: {
      bookingId: row.booking_id,
      contact: {
        ...extractLocalFormContact(submission),
        bookingCode: row.booking_id,
      },
      stayDetails: {
        bookingId: row.booking_id,
        propertyName: row.property_name,
        checkinDate: row.checkin_date,
      },
    },
    persistState: true,
  });
}

async function recordWebhookLog({ row, payload, sendResult }) {
  try {
    await appendLogs([
      {
        timestamp: new Date().toISOString(),
        automation: "Jervis Access Code Webhook",
        property: row?.property_name || payload.propertyName || "—",
        action: sendResult?.action || `Stored Jervis access code for booking ${row?.booking_id || payload.bookingId}`,
        status: sendResult?.status || "info",
        bookingId: row?.booking_id || payload.bookingId,
        decision: sendResult?.decision,
        deliveryChannel: sendResult?.deliveryChannel,
      },
    ]);
  } catch {
    // Activity logging should never make the webhook fail.
  }
}

export async function POST(request) {
  const auth = authorized(request);
  if (!auth.ok) return auth.response;

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Supabase is not configured for access code storage." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jervisReservationId = incomingJervisReservationId(body);
  const existingByJervisId = await getAccessCodeReleaseByJervisReservationId(
    jervisReservationId
  );
  const payload = extractAccessCodeWebhookPayload({
    ...body,
    bookingId:
      existingByJervisId?.booking_id ||
      body.bookingId ||
      body.booking_id ||
      body.lodgifyReservationId ||
      body.lodgify_reservation_id,
    propertyId:
      body.propertyId || body.property_id || existingByJervisId?.property_id,
    propertyName:
      body.propertyName || body.property_name || existingByJervisId?.property_name,
    guestEmail:
      body.guestEmail || body.guest_email || existingByJervisId?.guest_email,
    guestName:
      body.guestName || body.guest_name || existingByJervisId?.guest_name,
    checkinDate:
      body.checkinDate || body.checkin_date || existingByJervisId?.checkin_date,
  });
  if (!payload.bookingId || !payload.accessCode) {
    return NextResponse.json(
      {
        error:
          "Missing booking/reservation ID or access code. Send bookingId/reservationId plus accessCode/code.",
      },
      { status: 400 }
    );
  }

  try {
    const row = await upsertAccessCodeRelease(payload);
    const sendResult = await maybePostConfiguredLodgifyMessage(row);
    await recordWebhookLog({ row, payload, sendResult });
    return NextResponse.json({
      ok: true,
      bookingId: row.booking_id,
      status: row.status,
      source: row.source,
      sendResult,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not store access code.",
      },
      { status: 500 }
    );
  }
}
