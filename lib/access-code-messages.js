import { getConfig } from "@/lib/kv";
import { getBookingById, sendBookingMessage } from "@/lib/lodgify";
import {
  getAccessCodeRelease,
  markAccessCodeReleaseBlocked,
  markAccessCodeReleaseFailed,
  markAccessCodeReleaseSent,
  resolveAccessCodeForBooking,
} from "@/lib/access-code-releases";

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

export function todayCentral() {
  return centralDateFor(new Date());
}

function centralDateFor(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function toDateOnly(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? "" : parsed.toISOString().split("T")[0];
}

function publicAppBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_DASHBOARD_URL ||
    process.env.APP_URL;

  if (configured) return clean(configured).replace(/\/+$/, "");
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "");
  }
  return "https://zenfulcove-admin.vercel.app";
}

export function localFormUrl(slug) {
  try {
    return new URL(`/forms/${slug}`, publicAppBaseUrl()).toString();
  } catch {
    return `https://zenfulcove-admin.vercel.app/forms/${slug}`;
  }
}

function payloadValue(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && clean(value)) return value;
  }
  return "";
}

function payloadRange(payload) {
  const direct = payloadValue(payload, [
    "stayDates",
    "dateRange",
    "dates",
    "reservationDates",
    "reservation_dates",
  ]);
  if (direct && typeof direct === "object") return direct;

  for (const value of Object.values(payload || {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if ("checkIn" in value || "checkOut" in value) return value;
    if ("check_in" in value || "check_out" in value) return value;
    if ("arrival" in value || "departure" in value) return value;
  }

  return {};
}

export function extractStayDetailsFromPayload(payload = {}) {
  const range = payloadRange(payload);
  return {
    bookingId: firstNonEmpty([
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
    propertyName: firstNonEmpty([
      payloadValue(payload, [
        "stayUnit",
        "unit",
        "unitName",
        "propertyName",
        "property_name",
        "rental",
        "rentalName",
      ]),
    ]),
    checkinDate: toDateOnly(
      firstNonEmpty([
        range.checkIn,
        range.check_in,
        range.arrival,
        payloadValue(payload, [
          "checkIn",
          "check_in",
          "checkinDate",
          "checkin_date",
          "arrival",
          "arrivalDate",
        ]),
      ])
    ),
    checkoutDate: toDateOnly(
      firstNonEmpty([
        range.checkOut,
        range.check_out,
        range.departure,
        payloadValue(payload, [
          "checkOut",
          "check_out",
          "checkoutDate",
          "checkout_date",
          "departure",
          "departureDate",
        ]),
      ])
    ),
  };
}

function bookingContact(booking = {}, fallback = {}) {
  const guest = booking.guest || {};
  const customer = booking.customer || {};
  const traveler = booking.traveler || {};
  const fallbackContact = fallback.contact || {};
  const primaryPhoneObject = guest.phone || customer.phone || traveler.phone || {};
  const fullName = firstNonEmpty([
    guest.name,
    booking.guestName,
    customer.name,
    traveler.name,
    fallbackContact.fullName,
    `${fallbackContact.firstName || ""} ${fallbackContact.lastName || ""}`,
    `${guest.firstName || guest.first_name || ""} ${guest.lastName || guest.last_name || ""}`,
    `${customer.firstName || customer.first_name || ""} ${customer.lastName || customer.last_name || ""}`,
  ]);
  const derived = splitName(fullName);

  return {
    email: normalizeEmail(
      firstNonEmpty([
        guest.email,
        customer.email,
        traveler.email,
        booking.guestEmail,
        booking.email,
        booking.customerEmail,
        fallbackContact.email,
      ])
    ),
    firstName: firstNonEmpty([
      guest.firstName,
      guest.first_name,
      customer.firstName,
      customer.first_name,
      traveler.firstName,
      traveler.first_name,
      fallbackContact.firstName,
      derived.firstName,
    ]),
    lastName: firstNonEmpty([
      guest.lastName,
      guest.last_name,
      customer.lastName,
      customer.last_name,
      traveler.lastName,
      traveler.last_name,
      fallbackContact.lastName,
      derived.lastName,
    ]),
    phone: firstNonEmpty([
      typeof primaryPhoneObject === "string" ? primaryPhoneObject : "",
      primaryPhoneObject.fullNumber,
      primaryPhoneObject.phone,
      primaryPhoneObject.number,
      primaryPhoneObject.e164Phone,
      guest.phoneNumber,
      guest.mobilePhone,
      customer.phoneNumber,
      customer.mobilePhone,
      traveler.phoneNumber,
      traveler.mobilePhone,
      booking.phone,
      booking.phoneNumber,
      booking.guestPhone,
      fallbackContact.phone,
    ]),
    fullName: fullName || "Guest",
  };
}

function bookingContext(booking = {}, fallback = {}) {
  const stayDetails = fallback.stayDetails || {};
  const contact = bookingContact(booking, fallback);
  const bookingId = clean(
    booking.id ||
      booking.bookingId ||
      booking.reservationId ||
      booking.reservation_id ||
      stayDetails.bookingId ||
      fallback.bookingId
  );

  return {
    bookingId,
    propertyId: clean(booking.property_id ?? booking.propertyId ?? fallback.propertyId),
    propertyName: firstNonEmpty([
      booking.property_name,
      booking.propertyName,
      booking.property?.name,
      stayDetails.propertyName,
      fallback.propertyName,
    ]),
    guestEmail: contact.email,
    guestFirstName: contact.firstName || "Guest",
    guestLastName: contact.lastName,
    guestName: contact.fullName || "Guest",
    guestPhone: contact.phone,
    checkinDate: toDateOnly(
      firstNonEmpty([
        booking.arrival,
        booking.start_date,
        booking.checkIn,
        booking.checkin_date,
        stayDetails.checkinDate,
        fallback.checkinDate,
      ])
    ),
    checkoutDate: toDateOnly(
      firstNonEmpty([
        booking.departure,
        booking.end_date,
        booking.checkOut,
        booking.checkout_date,
        stayDetails.checkoutDate,
        fallback.checkoutDate,
      ])
    ),
  };
}

function normalizeLookupKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function configuredObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

function parseJsonObject(value) {
  const raw = clean(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return configuredObject(parsed);
  } catch {
    return {};
  }
}

function propertyMessageDataFor(context, config = {}) {
  const map = {
    ...configuredObject(config.propertyMessageData),
    ...parseJsonObject(config.propertyMessageJson),
  };
  const candidates = [
    context.propertyId,
    context.propertyName,
    normalizeLookupKey(context.propertyId),
    normalizeLookupKey(context.propertyName),
  ].filter(Boolean);

  for (const key of candidates) {
    if (map[key] && typeof map[key] === "object") return map[key];
  }

  for (const [key, value] of Object.entries(map)) {
    const normalizedKey = normalizeLookupKey(key);
    if (
      candidates.some(
        (candidate) =>
          candidate === normalizedKey ||
          candidate.includes(normalizedKey) ||
          normalizedKey.includes(candidate)
      ) &&
      typeof value === "object"
    ) {
      return value;
    }
  }

  return {};
}

function templateDefaults(config = {}) {
  return {
    siteName: "Zenfulcove",
    address: "Zenfulcove, 103 Potato Smith Rd unit c, Elgin, TX 78621",
    checkinTime: "3:00 p.m.",
    checkoutTime: "11:00 a.m.",
    hostName: "Norma",
    urgentPhone: "512-273-7962",
    kayakRentalSingleRate: "$50/day",
    kayakRentalTandemRate: "$65/day",
    kayakRentalFormText: "Kayak Rental Inquiry Form",
    ...configuredObject(config.templateDefaults),
  };
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function messageText(data, includeAccessCode) {
  const accessLine = includeAccessCode
    ? `Access Code: ${data.KeyCode || ""}`
    : `Reservation Form: ${data.reservationFormUrl}`;
  const codeNote = includeAccessCode
    ? "If the code was not provided in the message or if there is a \"-\" where the code should be, please wait a few minutes and the code should be sent shortly.\n\n(Please note that the code will only work during your reservation time.)"
    : "Access codes are only released once the form is submitted.";

  return [
    `Greetings ${data.GuestFirstName},`,
    "",
    `We are excited to welcome you to the ${data.propertyDisplayName} at ${data.siteName}.`,
    "To help you get started, we have provided some important information below:",
    "",
    "Please remember to complete the Reservation Form with our Terms & Conditions before check-in.",
    "",
    "If you have already done so, you are all set. Access codes are only activated once the form is submitted.",
    "",
    "Your booking details:",
    "",
    `You can check in any time after ${data.checkinTime}.`,
    "",
    `Check-out time is ${data.checkoutTime}.`,
    "",
    `Check-in Date: ${data.Arrival}`,
    "",
    `Check-out Date: ${data.Departure}`,
    "",
    "Directions to the property:",
    "",
    data.address,
    "",
    data.unitDirections,
    "",
    data.parkingInstructions,
    "",
    `${data.propertyDisplayName} Wifi Access:`,
    "",
    `Wifi: ${data.wifiName}`,
    "",
    `Password: ${data.wifiPassword}`,
    "",
    accessLine,
    "",
    codeNote,
    "",
    "Kayaks:",
    "",
    data.dedicatedKayakText,
    "",
    data.additionalKayakText,
    "",
    data.lifeJacketText,
    "",
    data.amenitiesText,
    "",
    data.additionalRulesText,
    "",
    "Best,",
    data.hostName,
    data.siteName,
    "",
    `For urgent matters, you can text or call ${data.urgentPhone}`,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}

function textToHtml(text) {
  return clean(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function renderMessageTemplate(template, data = {}) {
  const raw = String(template || "");
  if (!raw.trim()) return "";

  return raw.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const direct = data[key];
    if (direct !== undefined && direct !== null) return String(direct);

    const normalizedKey = clean(key).toLowerCase();
    const match = Object.entries(data).find(
      ([dataKey]) => clean(dataKey).toLowerCase() === normalizedKey
    );
    const value = match?.[1];
    return value === undefined || value === null ? "" : String(value);
  });
}

function defaultSubject(data, includeAccessCode) {
  return includeAccessCode
    ? `Access Code for ${data.propertyDisplayName || data.propertyName || "Zenfulcove"}`
    : `Reservation form needed for ${data.propertyDisplayName || data.propertyName || "Zenfulcove"}`;
}

export function buildAccessCodeTemplateData({
  booking,
  automationConfig,
  accessCode = "",
  fallback = {},
  includeAccessCode = true,
}) {
  const config = automationConfig.accessCodeRelease || {};
  const context = bookingContext(booking, fallback);
  const defaults = templateDefaults(config);
  const propertyData = {
    ...defaults,
    ...propertyMessageDataFor(context, config),
  };
  const propertyDisplayName = firstNonEmpty([
    propertyData.displayName,
    propertyData.propertyDisplayName,
    context.propertyName,
    "Property",
  ]);
  const directionsName = firstNonEmpty([
    propertyData.directionsName,
    propertyData.signName,
    propertyDisplayName,
  ]);
  const unitDirections = firstNonEmpty([
    propertyData.unitDirections,
    `Once you are at ${propertyData.siteName}, follow the signs to the "${directionsName.toUpperCase()}"`,
  ]);
  const parkingInstructions = firstNonEmpty([
    propertyData.parkingInstructions,
    propertyData.parking,
    "Parking - please park in front of your unit on the white gravel driveway.",
  ]);
  const dedicatedKayakText = firstNonEmpty([
    propertyData.dedicatedKayakText,
    propertyData.kayakText,
    propertyData.kayakLockCode
      ? `There is one dedicated kayak for ${directionsName} guests. The kayak lock code is ${propertyData.kayakLockCode}.`
      : "",
  ]);
  const additionalKayakText = firstNonEmpty([
    propertyData.additionalKayakText,
    `We have additional kayaks available and a Tandem (two seater) kayak for rent. These kayaks are available for rent for ${propertyData.kayakRentalSingleRate} each single kayak and ${propertyData.kayakRentalTandemRate} for the double seater kayak.`,
  ]);
  const lifeJacketText = firstNonEmpty([
    propertyData.lifeJacketText,
    "Please use the provided life jackets when boarding. If children are in the pond area or rowing in the water, it is required to have an adult supervising.",
  ]);
  const amenitiesText = firstNonEmpty([
    propertyData.amenitiesText,
    "If you have any questions, please let me know. I have left a journal in the unit as a gift to you.",
  ]);
  const additionalRulesText = firstNonEmpty([
    propertyData.additionalRulesText,
    "I have left additional rules in the unit. If there is anything else I can do to make your stay enjoyable, please let me know in this thread.",
  ]);

  const data = {
    guestName: context.guestName,
    guestFirstName: context.guestFirstName,
    guestLastName: context.guestLastName,
    guestPhone: context.guestPhone,
    GuestName: context.guestName,
    GuestFirstName: context.guestFirstName,
    GuestLastName: context.guestLastName,
    bookingId: context.bookingId,
    propertyId: context.propertyId,
    propertyName: context.propertyName,
    propertyDisplayName,
    unitName: context.propertyName,
    UnitName: context.propertyName,
    siteName: propertyData.siteName,
    address: propertyData.address,
    unitDirections,
    parkingInstructions,
    wifiName: firstNonEmpty([propertyData.wifiName, propertyData.wifi, ""]),
    wifiPassword: firstNonEmpty([
      propertyData.wifiPassword,
      propertyData.password,
      "",
    ]),
    checkinTime: propertyData.checkinTime,
    checkoutTime: propertyData.checkoutTime,
    checkinDate: context.checkinDate,
    checkoutDate: context.checkoutDate,
    checkInDate: context.checkinDate,
    checkOutDate: context.checkoutDate,
    Arrival: context.checkinDate,
    Departure: context.checkoutDate,
    accessCode,
    code: accessCode,
    KeyCode: accessCode,
    hasAccessCode: Boolean(accessCode),
    reservationFormUrl: localFormUrl(
      config.localFormSlug ||
        automationConfig.waiverReminders?.localFormSlug ||
        "guest-info"
    ),
    waiverUrl: localFormUrl(
      config.localFormSlug ||
        automationConfig.waiverReminders?.localFormSlug ||
        "guest-info"
    ),
    dedicatedKayakText,
    additionalKayakText,
    lifeJacketText,
    amenitiesText,
    additionalRulesText,
    hostName: propertyData.hostName,
    urgentPhone: propertyData.urgentPhone,
  };

  const configuredTemplate = includeAccessCode
    ? config.accessCodeMessageTemplate
    : config.missingFormMessageTemplate || config.finalReminderMessageTemplate;
  const text =
    renderMessageTemplate(configuredTemplate, data) ||
    messageText(data, includeAccessCode);
  const subjectTemplate = includeAccessCode
    ? config.accessCodeSubjectTemplate
    : config.missingFormSubjectTemplate || config.finalReminderSubjectTemplate;
  const subject =
    renderMessageTemplate(subjectTemplate, data) ||
    defaultSubject(data, includeAccessCode);
  return {
    ...data,
    accessMessageText: text,
    accessMessageHtml: textToHtml(text),
    lodgifyMessageSubject: subject,
    lodgifyMessageText: text,
  };
}

function result(status, action, details = {}) {
  return {
    status,
    action,
    timestamp: new Date().toISOString(),
    ...details,
  };
}

function releaseConfig(automationConfig) {
  return automationConfig.accessCodeRelease || {};
}

function allowedByPropertyFilter(context, config) {
  const propertyIds = Array.isArray(config.propertyIds) ? config.propertyIds : [];
  if (propertyIds.length === 0) return true;
  return propertyIds.includes(clean(context.propertyId));
}

export async function sendAccessCodeForBooking({
  booking,
  automationConfig,
  dryRun = false,
  fallback = {},
  persistState = true,
  messagePrefix = "",
}) {
  const config = releaseConfig(automationConfig);
  if (!config.enabled) return result("skipped", "Access code release disabled");

  const context = bookingContext(booking, fallback);
  if (!context.bookingId) return result("skipped", "No booking ID available");
  if (!allowedByPropertyFilter(context, config)) {
    return result("skipped", `Skipped booking ${context.bookingId}: property is not enabled`);
  }

  const existing = await getAccessCodeRelease(context.bookingId);
  if (persistState !== false && (existing?.sent_at || existing?.status === "sent")) {
    return result("skipped", `Skipped booking ${context.bookingId}: access code already sent`);
  }

  if (dryRun) {
    const templateData = buildAccessCodeTemplateData({
      booking,
      automationConfig,
      accessCode: "DRY-RUN-CODE",
      fallback,
      includeAccessCode: true,
    });
    return result(
      "success",
      `[DRY RUN] Would post Lodgify access-code message to booking ${context.bookingId} | ${templateData.propertyDisplayName || context.propertyName || "Property"} | arrival ${templateData.Arrival || "unknown"}`,
      {
        templateData,
        bookingId: context.bookingId,
        deliveryChannel: "lodgify",
        decision: "access-code",
      }
    );
  }

  let resolved;
  try {
    resolved = await resolveAccessCodeForBooking(
      {
        bookingId: context.bookingId,
        propertyId: context.propertyId,
        propertyName: context.propertyName,
        guestEmail: context.guestEmail,
        guestName: context.guestName,
        guestFirstName: context.guestFirstName,
        guestLastName: context.guestLastName,
        guestPhone: context.guestPhone,
        checkinDate: context.checkinDate,
        checkoutDate: context.checkoutDate,
        lodgifyBooking: booking,
      },
      config
    );
  } catch (err) {
    if (persistState !== false) {
      await markAccessCodeReleaseFailed({
        bookingId: context.bookingId,
        error: err.message,
      }).catch(() => {});
    }
    return result(
      "failed",
      `Failed booking ${context.bookingId}: access code lookup failed (${err.message})`
    );
  }

  if (!resolved?.code) {
    return result(
      "failed",
      `Failed booking ${context.bookingId}: no access code available from stored codes, static property codes, Lodgify booking payload, or Jervis API`
    );
  }

  const templateData = buildAccessCodeTemplateData({
    booking,
    automationConfig,
    accessCode: resolved.code,
    fallback,
    includeAccessCode: true,
  });

  try {
    await sendBookingMessage(context.bookingId, {
      subject: templateData.lodgifyMessageSubject,
      message: `${messagePrefix || ""}${templateData.lodgifyMessageText}`,
      type: config.lodgifyMessageType || "Owner",
      sendNotification: config.lodgifySendNotification !== false,
    });
    if (persistState !== false) {
      await markAccessCodeReleaseSent({
        bookingId: context.bookingId,
        templateId: "lodgify:access-code",
        channel: "lodgify",
      });
    }
    return result(
      "success",
      `Posted access code to Lodgify booking thread ${context.bookingId}`
    );
  } catch (err) {
    const detail = err.response?.body?.errors?.[0]?.message || err.message;
    if (persistState !== false) {
      await markAccessCodeReleaseFailed({
        bookingId: context.bookingId,
        error: detail,
      }).catch(() => {});
    }
    return result(
      "failed",
      `Failed to post access code to Lodgify booking ${context.bookingId}: ${detail}`
    );
  }
}

function blockedAttemptWasToday(existing, templateId) {
  if (!existing?.last_attempt_at) return false;
  if (existing.status !== "blocked") return false;
  if (clean(existing.sendgrid_template_id) !== clean(templateId)) return false;
  return centralDateFor(existing.last_attempt_at) === todayCentral();
}

export async function sendMissingFormEmailForBooking({
  booking,
  automationConfig,
  dryRun = false,
  fallback = {},
  persistState = true,
  messagePrefix = "",
}) {
  const config = releaseConfig(automationConfig);
  const templateId = "lodgify:missing-form";

  const context = bookingContext(booking, fallback);
  if (!context.bookingId) return result("skipped", "No booking ID available");
  if (!allowedByPropertyFilter(context, config)) {
    return result("skipped", `Skipped booking ${context.bookingId}: property is not enabled`);
  }

  const existing = await getAccessCodeRelease(context.bookingId);
  if (persistState !== false && (existing?.sent_at || existing?.status === "sent")) {
    return result("skipped", `Skipped booking ${context.bookingId}: access code already sent`);
  }
  if (persistState !== false && blockedAttemptWasToday(existing, templateId)) {
    return result(
      "skipped",
      `Skipped booking ${context.bookingId}: missing-form Lodgify message already sent today`
    );
  }

  const templateData = buildAccessCodeTemplateData({
    booking,
    automationConfig,
    accessCode: "",
    fallback,
    includeAccessCode: false,
  });

  if (dryRun) {
    return result(
      "success",
      `[DRY RUN] Would post missing-form Lodgify message to booking ${context.bookingId} | ${templateData.propertyDisplayName || context.propertyName || "Property"} | arrival ${templateData.Arrival || "unknown"}`,
      {
        templateData,
        bookingId: context.bookingId,
        deliveryChannel: "lodgify",
        decision: "missing-form",
      }
    );
  }

  try {
    await sendBookingMessage(context.bookingId, {
      subject: templateData.lodgifyMessageSubject,
      message: `${messagePrefix || ""}${templateData.lodgifyMessageText}`,
      type: config.lodgifyMessageType || "Owner",
      sendNotification: config.lodgifySendNotification !== false,
    });
    if (persistState !== false) {
      await markAccessCodeReleaseBlocked({
        bookingId: context.bookingId,
        propertyId: context.propertyId,
        propertyName: context.propertyName,
        guestEmail: context.guestEmail,
        guestName: context.guestName,
        checkinDate: context.checkinDate,
        templateId,
        channel: "lodgify",
        error: "Form not submitted yet; missing-form Lodgify message sent.",
        raw: { reason: "missing-form-lodgify-message" },
      });
    }
    return result(
      "success",
      `Posted missing-form reminder to Lodgify booking thread ${context.bookingId}`
    );
  } catch (err) {
    const detail = err.response?.body?.errors?.[0]?.message || err.message;
    if (persistState !== false) {
      await markAccessCodeReleaseBlocked({
        bookingId: context.bookingId,
        propertyId: context.propertyId,
        propertyName: context.propertyName,
        guestEmail: context.guestEmail,
        guestName: context.guestName,
        checkinDate: context.checkinDate,
        templateId,
        channel: "lodgify",
        error: detail,
        raw: { reason: "missing-form-lodgify-message-failed" },
      }).catch(() => {});
    }
    return result(
      "failed",
      `Failed to post missing-form Lodgify message for booking ${context.bookingId}: ${detail}`
    );
  }
}

function dateOnlyTime(value) {
  const normalized = toDateOnly(value);
  if (!normalized) return null;
  const date = new Date(`${normalized}T12:00:00Z`);
  return isNaN(date.getTime()) ? null : date.getTime();
}

function daysUntilCentral(dateOnly) {
  const target = dateOnlyTime(dateOnly);
  const today = dateOnlyTime(todayCentral());
  if (target == null || today == null) return null;
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}

export async function maybeSendSameDayAccessCodeForSubmission({
  formSlug,
  payload,
  contact,
}) {
  const automationConfig = await getConfig();
  const config = releaseConfig(automationConfig);
  const configuredSlug = clean(
    config.localFormSlug || automationConfig.waiverReminders?.localFormSlug || ""
  ).replace(/^\/?forms\//, "");

  if (!config.enabled) return result("skipped", "Access code release disabled");
  if (configuredSlug && clean(formSlug) !== configuredSlug) {
    return result("skipped", "Submitted form is not the configured access form");
  }

  const stayDetails = extractStayDetailsFromPayload(payload);
  const daysUntilStay = daysUntilCentral(stayDetails.checkinDate);
  const immediateLeadDays = Math.max(
    0,
    Number(config.immediateReleaseDaysBeforeCheckin ?? 1)
  );
  if (
    daysUntilStay === null ||
    daysUntilStay < 0 ||
    daysUntilStay > immediateLeadDays
  ) {
    return result(
      "skipped",
      `Submitted stay starts ${stayDetails.checkinDate || "on an unknown date"}, outside the immediate release window`
    );
  }

  const bookingId = clean(contact?.bookingCode || stayDetails.bookingId);
  if (!bookingId) {
    return result("skipped", "No booking ID available from the form submission");
  }

  let booking = null;
  try {
    booking = await getBookingById(bookingId);
  } catch (err) {
    booking = null;
  }

  if (!booking) {
    booking = {
      id: bookingId,
      property_name: stayDetails.propertyName,
      arrival: stayDetails.checkinDate,
      departure: stayDetails.checkoutDate,
      guest: {
        email: contact?.email,
        name: [contact?.firstName, contact?.lastName].filter(Boolean).join(" "),
      },
    };
  }

  return sendAccessCodeForBooking({
    booking,
    automationConfig,
    fallback: {
      contact,
      stayDetails,
      bookingId,
    },
  });
}
