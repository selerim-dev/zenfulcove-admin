import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { appendStayMessage, getConfig, listStayMessages } from "@/lib/kv";
import {
  getBookingById,
  getMessageThread,
  sendBookingMessage,
} from "@/lib/lodgify";
import {
  buildLodgifyGuestMessageBody,
  extractStayMessagesFromLodgify,
  findLodgifyThreadGuid,
  mergeStayMessages,
  prepareStayMessagesForResponse,
} from "@/lib/stay-messages";
import {
  signStayMessageAttachment,
  uploadStayMessageAttachment,
} from "@/lib/stay-message-attachments";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { sendPlainEmail } from "@/lib/sendgrid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

function firstNonEmpty(values) {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return "";
}

function splitName(fullName) {
  const parts = clean(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function lastNameMatches(guestName, input) {
  const normalizedGuest = clean(guestName).toLowerCase();
  const normalizedInput = clean(input).toLowerCase();
  if (!normalizedGuest || !normalizedInput) return false;
  const words = normalizedGuest.split(/\s+/);
  return words.includes(normalizedInput) || normalizedGuest.endsWith(normalizedInput);
}

function toDateOnly(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function guestFromBooking(booking = {}) {
  const guest = booking.guest || {};
  const customer = booking.customer || {};
  const traveler = booking.traveler || {};
  const phoneObject = guest.phone || customer.phone || traveler.phone || {};
  const fullName = firstNonEmpty([
    guest.name,
    booking.guestName,
    booking.guest_name,
    customer.name,
    traveler.name,
    `${guest.firstName || guest.first_name || ""} ${guest.lastName || guest.last_name || ""}`,
    `${customer.firstName || customer.first_name || ""} ${customer.lastName || customer.last_name || ""}`,
  ]);
  const derived = splitName(fullName);

  return {
    name: fullName || "Guest",
    firstName: firstNonEmpty([
      guest.firstName,
      guest.first_name,
      customer.firstName,
      customer.first_name,
      traveler.firstName,
      traveler.first_name,
      derived.firstName,
    ]),
    lastName: firstNonEmpty([
      guest.lastName,
      guest.last_name,
      customer.lastName,
      customer.last_name,
      traveler.lastName,
      traveler.last_name,
      derived.lastName,
    ]),
    email: normalizeEmail(
      firstNonEmpty([
        guest.email,
        customer.email,
        traveler.email,
        booking.guestEmail,
        booking.email,
        booking.customerEmail,
      ])
    ),
    phone: firstNonEmpty([
      typeof phoneObject === "string" ? phoneObject : "",
      phoneObject.fullNumber,
      phoneObject.phone,
      phoneObject.number,
      phoneObject.e164Phone,
      guest.phoneNumber,
      guest.mobilePhone,
      customer.phoneNumber,
      customer.mobilePhone,
      traveler.phoneNumber,
      traveler.mobilePhone,
      booking.phone,
      booking.phoneNumber,
      booking.guestPhone,
    ]),
  };
}

function normalizeBooking(booking = {}) {
  const guest = guestFromBooking(booking);
  return {
    id: clean(
      booking.id ||
        booking.bookingId ||
        booking.reservationId ||
        booking.reservation_id
    ),
    propertyName: firstNonEmpty([
      booking.property_name,
      booking.propertyName,
      booking.property?.name,
    ]),
    arrivalIso: toDateOnly(
      firstNonEmpty([
        booking.arrival,
        booking.arrival_date,
        booking.start_date,
        booking.checkIn,
        booking.checkin_date,
      ])
    ),
    departureIso: toDateOnly(
      firstNonEmpty([
        booking.departure,
        booking.departure_date,
        booking.end_date,
        booking.checkOut,
        booking.checkout_date,
      ])
    ),
    status: clean(booking.status || booking.booking_status || booking.reservationStatus),
    guest,
  };
}

async function requireGuestBooking({ reservationId, lastName }) {
  const requestedReservationId = clean(reservationId);
  if (!requestedReservationId) {
    return {
      response: NextResponse.json({ error: "Booking ID is required." }, { status: 400 }),
    };
  }

  let booking;
  try {
    booking = await getBookingById(requestedReservationId);
  } catch (err) {
    return {
      response: NextResponse.json(
        {
          error: "Could not reach Lodgify for that booking.",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 502 }
      ),
    };
  }

  if (!booking) {
    return {
      response: NextResponse.json(
        { error: "We could not find that booking." },
        { status: 404 }
      ),
    };
  }

  const normalized = normalizeBooking(booking);
  if (clean(lastName) && !lastNameMatches(normalized.guest.name, lastName)) {
    return {
      response: NextResponse.json(
        { error: "That last name does not match the booking." },
        { status: 401 }
      ),
    };
  }

  return { booking, normalized };
}

async function loadLodgifyMessages(booking, bookingId) {
  const directMessages = extractStayMessagesFromLodgify(booking, { bookingId });
  const threadGuid = findLodgifyThreadGuid(booking);
  if (!threadGuid) return directMessages;

  try {
    const thread = await getMessageThread(threadGuid);
    return [
      ...directMessages,
      ...extractStayMessagesFromLodgify(thread, { bookingId }),
    ];
  } catch (err) {
    console.warn("[stay-messages] Could not load Lodgify message thread:", err);
    return directMessages;
  }
}

async function responseForThread({ booking, normalized }) {
  const [localMessages, lodgifyMessages] = await Promise.all([
    listStayMessages({ bookingId: normalized.id }),
    loadLodgifyMessages(booking, normalized.id),
  ]);
  const messages = await prepareStayMessagesForResponse(
    mergeStayMessages(lodgifyMessages, localMessages)
  );

  return NextResponse.json({
    ok: true,
    booking: {
      id: normalized.id,
      status: normalized.status,
      propertyName: normalized.propertyName,
      arrivalIso: normalized.arrivalIso,
      departureIso: normalized.departureIso,
      guestName: normalized.guest.name,
      guestFirstName: normalized.guest.firstName,
    },
    capabilities: {
      attachments: hasSupabaseAdminEnv(),
      maxAttachmentBytes: 8 * 1024 * 1024,
    },
    messages,
  });
}

async function messagesFeatureResponseIfDisabled() {
  const config = await getConfig();
  if (config?.customerPortal?.navigation?.messages !== true) {
    return NextResponse.json(
      { error: "Guest messaging is not available right now." },
      { status: 404 }
    );
  }
  return null;
}

async function postGuestMessageToLodgify({ booking, message }) {
  const guestLabel = booking.guest.name || booking.guest.firstName || "Guest";
  const relayMessage = [
    "Guest portal submission for this booking.",
    `Portal guest: ${guestLabel}`,
    `Booking: ${booking.id}`,
    "",
    "Message:",
    message,
  ].join("\n");

  await sendBookingMessage(booking.id, {
    subject: `Guest portal submission for ${booking.propertyName || "stay"} ${booking.id}`,
    message: relayMessage,
    type: "Owner",
    sendNotification: false,
  });
  return { mode: "owner-note" };
}

async function notifyGuestPortalMessage({ booking, body, attachments = [] }) {
  const config = await getConfig();
  const notif = config?.messageNotifications;
  if (!notif?.enabled) return;

  const recipients = Array.isArray(notif.recipients)
    ? notif.recipients.map((recipient) => clean(recipient)).filter(Boolean)
    : [];
  if (recipients.length === 0) return;

  const from = {
    email: config?.sendgrid?.fromEmail,
    name: config?.sendgrid?.fromName,
  };
  if (!from.email) return;

  const guestName = booking.guest.name || "Guest";
  const property = booking.propertyName || "stay";
  const preview = clean(body).slice(0, 120).replace(/\s+/g, " ");
  const subject = `[Zenfulcove Glamping] Guest portal message from ${guestName}${preview ? ` - ${preview}` : ""}`;
  const attachmentLines = attachments
    .map((attachment) => {
      const name = clean(attachment.fileName || "Attachment");
      const url = clean(attachment.signedUrl || attachment.url);
      return url ? `${name}: ${url}` : "";
    })
    .filter(Boolean);

  const text = [
    `Guest portal message from ${guestName}`,
    `Booking: ${booking.id}`,
    `Property: ${property}`,
    "",
    "Message:",
    clean(body) || "(attachment-only message)",
    "",
    ...(attachmentLines.length ? ["Attachments:", ...attachmentLines, ""] : []),
    "Open the Lodgify booking thread to reply.",
  ].join("\n");

  await Promise.all(
    recipients.map((to) => sendPlainEmail({ to, subject, text, from }))
  );
}

export async function GET(request) {
  const disabled = await messagesFeatureResponseIfDisabled();
  if (disabled) return disabled;

  const { searchParams } = new URL(request.url);
  const auth = await requireGuestBooking({
    reservationId: searchParams.get("reservationId") || searchParams.get("reservation"),
    lastName: searchParams.get("lastName") || "",
  });
  if (auth.response) return auth.response;
  return responseForThread(auth);
}

export async function POST(request) {
  const disabled = await messagesFeatureResponseIfDisabled();
  if (disabled) return disabled;

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const reservationId = clean(formData.get("reservationId") || formData.get("reservation"));
  const lastName = clean(formData.get("lastName"));
  const messageBody = clean(formData.get("body"));
  const files = formData
    .getAll("attachments")
    .filter((file) => file && typeof file === "object" && file.size > 0);

  if (!messageBody && files.length === 0) {
    return NextResponse.json(
      { error: "A message or attachment is required." },
      { status: 400 }
    );
  }

  if (files.length > 5) {
    return NextResponse.json(
      { error: "You can attach up to 5 files per message." },
      { status: 400 }
    );
  }

  if (files.length > 0 && !hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Attachments are not configured yet." },
      { status: 400 }
    );
  }

  const auth = await requireGuestBooking({ reservationId, lastName });
  if (auth.response) return auth.response;
  const { booking, normalized } = auth;

  let attachments = [];
  try {
    attachments = await Promise.all(
      files.map((file) =>
        uploadStayMessageAttachment({ bookingId: normalized.id, file })
      )
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Attachment upload failed." },
      { status: 400 }
    );
  }

  const signedAttachments = await Promise.all(
    attachments.map((attachment) => signStayMessageAttachment(attachment))
  );
  const lodgifyBody = buildLodgifyGuestMessageBody({
    body: messageBody,
    attachments: signedAttachments,
  });

  let lodgifyPost;
  try {
    lodgifyPost = await postGuestMessageToLodgify({
      booking: normalized,
      message: lodgifyBody,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Could not post that message to Lodgify.",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  await appendStayMessage({
    bookingId: normalized.id,
    message: {
      id: `guest_${randomUUID()}`,
      source: "guest-portal",
      direction: "guest",
      authorName: normalized.guest.firstName || normalized.guest.name || "Guest",
      body: messageBody,
      timestamp: Date.now(),
      status: "sent",
      lodgifyPostMode: lodgifyPost?.mode || "guest",
      attachments,
    },
  });

  await notifyGuestPortalMessage({
    booking: normalized,
    body: messageBody,
    attachments: signedAttachments,
  }).catch((err) => {
    console.warn("[stay-messages] Guest portal notification failed:", err);
  });

  return responseForThread({ booking, normalized });
}
