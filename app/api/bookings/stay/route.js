import { NextResponse } from "next/server";
import { getConfig } from "@/lib/kv";
import { getAccessCodeRelease } from "@/lib/access-code-releases";
import { buildAccessCodeTemplateData, localFormUrl } from "@/lib/access-code-messages";
import { getBookingById, getProperties } from "@/lib/lodgify";
import {
  bookingHasLocalFormSubmission,
  listLocalFormSubmissions,
} from "@/lib/local-forms";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { PROPERTY_TO_CABIN } from "@/lib/types";

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
  return isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
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
  const propertyId = clean(booking.property_id ?? booking.propertyId);
  return {
    id: clean(
      booking.id ||
        booking.bookingId ||
        booking.reservationId ||
        booking.reservation_id
    ),
    propertyId,
    propertyName: firstNonEmpty([
      booking.property_name,
      booking.propertyName,
      booking.property?.name,
      propertyId ? PROPERTY_TO_CABIN[Number(propertyId)] : "",
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

function normalizeProperty(property = {}) {
  return {
    id: clean(property.id ?? property.property_id ?? property.propertyId),
    name: clean(property.internal_name || property.internalName || property.name || property.title),
    address: firstNonEmpty([
      property.address,
      property.full_address,
      property.location?.address,
      [property.address1, property.city, property.state, property.zipcode]
        .map(clean)
        .filter(Boolean)
        .join(", "),
    ]),
    city: clean(property.city || property.location?.city),
    timezone: clean(property.timezone),
  };
}

async function loadLodgifyProperty(propertyId) {
  if (!propertyId) return null;
  try {
    const data = await getProperties();
    const items = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];
    return (
      items
        .map(normalizeProperty)
        .find((property) => property.id === clean(propertyId)) || null
    );
  } catch {
    return null;
  }
}

async function hasSubmittedInternalForm(bookingId, formSlug) {
  if (!hasSupabaseAdminEnv() || !bookingId || !formSlug) return false;
  try {
    const submissions = await listLocalFormSubmissions({
      formSlugs: [formSlug],
      limit: 10000,
    });
    return bookingHasLocalFormSubmission(bookingId, submissions);
  } catch {
    return false;
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const reservationId = clean(body.reservationId || body.reservation);
  const lastName = clean(body.lastName);
  if (!reservationId || !lastName) {
    return NextResponse.json(
      { error: "Booking ID and last name are required." },
      { status: 400 }
    );
  }

  let booking;
  try {
    booking = await getBookingById(reservationId);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Could not reach Lodgify for that booking.",
        details: err.message,
      },
      { status: 502 }
    );
  }

  if (!booking) {
    return NextResponse.json(
      { error: "We could not find that booking." },
      { status: 404 }
    );
  }

  const normalized = normalizeBooking(booking);
  if (!lastNameMatches(normalized.guest.name, lastName)) {
    return NextResponse.json(
      { error: "That last name does not match the booking." },
      { status: 401 }
    );
  }

  const config = await getConfig();
  const property = await loadLodgifyProperty(normalized.propertyId);
  const propertyName =
    normalized.propertyName ||
    property?.name ||
    PROPERTY_TO_CABIN[Number(normalized.propertyId)] ||
    "Your stay";
  const formSlug = clean(
    config.accessCodeRelease?.localFormSlug ||
      config.waiverReminders?.localFormSlug ||
      "guest-info"
  ).replace(/^\/?forms\//, "");
  const formSubmitted = await hasSubmittedInternalForm(normalized.id, formSlug);
  const release = await getAccessCodeRelease(normalized.id).catch(() => null);
  const releasedStatus = Boolean(release?.sent_at || release?.status === "sent");
  const accessCode = releasedStatus ? clean(release?.access_code) : "";
  const accessCodeReleased = Boolean(releasedStatus && accessCode);
  const templateData = buildAccessCodeTemplateData({
    booking: {
      ...booking,
      id: normalized.id,
      property_id: normalized.propertyId,
      property_name: propertyName,
      arrival: normalized.arrivalIso,
      departure: normalized.departureIso,
      guest: {
        name: normalized.guest.name,
        email: normalized.guest.email,
        phone: normalized.guest.phone,
      },
    },
    automationConfig: config,
    accessCode,
    fallback: {
      propertyName,
      checkinDate: normalized.arrivalIso,
      checkoutDate: normalized.departureIso,
      contact: {
        email: normalized.guest.email,
        firstName: normalized.guest.firstName,
        lastName: normalized.guest.lastName,
        phone: normalized.guest.phone,
      },
    },
    includeAccessCode: accessCodeReleased,
  });

  return NextResponse.json({
    ok: true,
    booking: {
      id: normalized.id,
      status: normalized.status,
      guestName: normalized.guest.name,
      guestFirstName: normalized.guest.firstName,
      guestEmail: normalized.guest.email,
      guestPhone: normalized.guest.phone,
      propertyId: normalized.propertyId,
      propertyName,
      arrivalIso: normalized.arrivalIso,
      departureIso: normalized.departureIso,
    },
    stay: {
      propertyDisplayName: templateData.propertyDisplayName,
      address: property?.address || templateData.address,
      timezone: property?.timezone || "America/Chicago",
      checkinTime: templateData.checkinTime,
      checkoutTime: templateData.checkoutTime,
      wifiName: templateData.wifiName,
      wifiPassword: templateData.wifiPassword,
      unitDirections: templateData.unitDirections,
      parkingInstructions: templateData.parkingInstructions,
      dedicatedKayakText: templateData.dedicatedKayakText,
      additionalKayakText: templateData.additionalKayakText,
      lifeJacketText: templateData.lifeJacketText,
      amenitiesText: templateData.amenitiesText,
      additionalRulesText: templateData.additionalRulesText,
      hostName: templateData.hostName,
      urgentPhone: templateData.urgentPhone,
      reservationFormUrl: formSlug ? localFormUrl(formSlug) : "",
    },
    access: {
      code: accessCode,
      released: accessCodeReleased,
      formSubmitted,
      status: release?.status || "pending",
      message: accessCodeReleased
        ? "Your access code is ready."
        : formSubmitted
          ? "Your form is complete. Access code release is pending check-in timing."
          : "Complete the reservation form to unlock access-code release.",
    },
  });
}
