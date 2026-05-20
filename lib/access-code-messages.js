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

function centralClock() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    hour: Number(byType.hour || 0) % 24,
    minute: Number(byType.minute || 0),
  };
}

function centralClockHasReached(hour, minute) {
  const clock = centralClock();
  const currentMinutes = clock.hour * 60 + clock.minute;
  const releaseMinutes = Number(hour || 0) * 60 + Number(minute || 0);
  return {
    reached: currentMinutes >= releaseMinutes,
    clock,
  };
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

const DEFAULT_DELAYED_ACCESS_PROPERTY_NAMES = ["Doodle House", "Desert Rose"];

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

function configuredList(value, fallback = []) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const raw = clean(value);
  if (!raw) return fallback;
  return raw.split(",").map(clean).filter(Boolean);
}

function delayedAccessPropertyNames(config = {}) {
  return configuredList(
    config.delayedAccessCodePropertyNames,
    DEFAULT_DELAYED_ACCESS_PROPERTY_NAMES
  );
}

function propertyUsesDelayedAccess(context, config = {}, propertyData = {}) {
  if (propertyData.delayAccessCodeUntilCheckinDay === true) return true;
  if (propertyData.delayAccessCodeUntilCheckinDay === false) return false;

  const propertyIds = configuredList(config.delayedAccessCodePropertyIds);
  if (propertyIds.includes(clean(context.propertyId))) return true;

  const delayedNames = delayedAccessPropertyNames(config).map(normalizeLookupKey);
  const candidates = [
    context.propertyName,
    propertyData.displayName,
    propertyData.propertyDisplayName,
    propertyData.directionsName,
  ]
    .map(normalizeLookupKey)
    .filter(Boolean);

  return candidates.some((candidate) =>
    delayedNames.some(
      (delayed) =>
        candidate === delayed ||
        candidate.includes(delayed) ||
        delayed.includes(candidate)
    )
  );
}

export function isDelayedAccessCodeBooking({
  booking,
  automationConfig,
  fallback = {},
}) {
  const config = releaseConfig(automationConfig);
  const context = bookingContext(booking, fallback);
  const propertyData = {
    ...templateDefaults(config),
    ...propertyMessageDataFor(context, config),
  };
  return propertyUsesDelayedAccess(context, config, propertyData);
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

function sanitizeMessageHtml(value) {
  const safeTags = new Set([
    "a",
    "br",
    "em",
    "i",
    "li",
    "ol",
    "p",
    "strong",
    "b",
    "u",
    "ul",
  ]);
  return String(value || "").replace(
    /<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi,
    (tag, rawName, rawAttrs = "") => {
      const name = rawName.toLowerCase();
      if (!safeTags.has(name)) return escapeHtml(tag);
      if (tag.startsWith("</")) return `</${name}>`;
      if (name === "br") return "<br>";
      if (name !== "a") return `<${name}>`;

      const hrefMatch = rawAttrs.match(/\shref=(["'])(.*?)\1/i);
      const href = hrefMatch?.[2]?.trim() || "";
      const isSafeHref = /^(https?:|mailto:|tel:|\/)/i.test(href);
      return isSafeHref
        ? `<a href="${escapeHtml(href)}" style="text-decoration: underline;">`
        : "<a>";
    }
  );
}

function preserveMessageBreaks(html) {
  return String(html || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/(<(?:ul|ol)>)[ \t]*\n+/gi, "$1")
    .replace(/\n+[ \t]*(<li>)/gi, "$1")
    .replace(/(<\/li>)[ \t]*\n+/gi, "$1")
    .replace(/\n+[ \t]*(<\/(?:ul|ol)>)/gi, "$1")
    .replace(/\n/g, "<br>");
}

function messageToLodgifyHtml(text, { trim = true } = {}) {
  const raw = trim ? clean(text) : String(text || "");
  if (!raw.trim()) return "";
  const hasHtml = /<\/?(a|br|em|i|li|ol|p|strong|b|u|ul)\b/i.test(raw);
  const safe = hasHtml ? sanitizeMessageHtml(raw) : escapeHtml(raw);
  return preserveMessageBreaks(safe);
}

function withLodgifyPrefix(prefix, messageHtml) {
  return `${messageToLodgifyHtml(prefix, { trim: false })}${messageHtml || ""}`;
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

function defaultMessageSubject(data, messageKind, includeAccessCode) {
  if (messageKind === "checkin-info") {
    return `Check-in information for ${data.propertyDisplayName || data.propertyName || "Zenfulcove"}`;
  }
  if (messageKind === "code-only") {
    return `Access code for ${data.propertyDisplayName || data.propertyName || "Zenfulcove"}`;
  }
  return defaultSubject(data, includeAccessCode);
}

function codeOnlyMessageText(data) {
  return [
    `Greetings ${data.GuestFirstName},`,
    "",
    `Your access code for ${data.propertyDisplayName || data.propertyName || "your stay"} is ready.`,
    "",
    `Access Code: ${data.KeyCode || ""}`,
    "",
    "(Please note that the code will only work during your reservation time.)",
  ].join("\n");
}

function checkinInfoMessageText(data) {
  return [
    `Greetings ${data.GuestFirstName},`,
    "",
    `We are excited to welcome you to the ${data.propertyDisplayName} at ${data.siteName}.`,
    "To help you get started, we have provided some important information below:",
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
    "Your access code will be sent on the morning of check-in.",
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

function defaultWaiverReminderSubject(data, reminder = {}) {
  return (
    renderMessageTemplate(reminder.subjectTemplate || reminder.subject || "", data) ||
    `Reservation form needed for ${data.propertyDisplayName || data.propertyName || "Zenfulcove"}`
  );
}

function defaultWaiverReminderText(data, reminder = {}) {
  const timingLine =
    Number(reminder.daysBeforeCheckin) === 0
      ? "Your check-in is today."
      : Number(reminder.daysBeforeCheckin) === 1
        ? "Your check-in is tomorrow."
        : `Your check-in is in ${Number(reminder.daysBeforeCheckin)} days.`;

  return (
    renderMessageTemplate(reminder.messageTemplate || reminder.messageBody || "", data) ||
    [
      `Greetings ${data.GuestFirstName},`,
      "",
      `${timingLine} Please complete the Zenfulcove reservation form before arrival so we can release your access information.`,
      "",
      data.propertyDisplayName ? `Stay: ${data.propertyDisplayName}` : "",
      data.Arrival ? `Check-in Date: ${data.Arrival}` : "",
      data.Departure ? `Check-out Date: ${data.Departure}` : "",
      "",
      `Reservation Form: ${data.reservationFormUrl}`,
      "",
      "Access codes are only released once the form is submitted.",
      "",
      "Best,",
      data.hostName || "Zenfulcove",
    ]
      .filter((line) => line !== null && line !== undefined)
      .join("\n")
  );
}

export function buildAccessCodeTemplateData({
  booking,
  automationConfig,
  accessCode = "",
  fallback = {},
  includeAccessCode = true,
  messageKind,
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

  const resolvedMessageKind =
    messageKind || (includeAccessCode ? "access" : "missing-form");
  const configuredTemplate =
    resolvedMessageKind === "code-only"
      ? propertyData.codeOnlyMessageTemplate ||
        config.codeOnlyMessageTemplate
      : resolvedMessageKind === "checkin-info"
        ? propertyData.checkinInfoMessageTemplate ||
          propertyData.accessCodeMessageTemplate ||
          propertyData.accessMessageTemplate ||
          config.checkinInfoMessageTemplate ||
          config.accessCodeMessageTemplate
        : includeAccessCode
          ? propertyData.accessCodeMessageTemplate ||
            propertyData.accessMessageTemplate ||
            config.accessCodeMessageTemplate
          : config.missingFormMessageTemplate || config.finalReminderMessageTemplate;
  const text =
    renderMessageTemplate(configuredTemplate, data) ||
    (resolvedMessageKind === "code-only"
      ? codeOnlyMessageText(data)
      : resolvedMessageKind === "checkin-info"
        ? checkinInfoMessageText(data)
      : messageText(data, includeAccessCode));
  const subjectTemplate =
    resolvedMessageKind === "code-only"
      ? propertyData.codeOnlySubjectTemplate ||
        config.codeOnlySubjectTemplate
      : resolvedMessageKind === "checkin-info"
        ? propertyData.checkinInfoSubjectTemplate ||
          propertyData.accessCodeSubjectTemplate ||
          propertyData.accessSubjectTemplate ||
          config.checkinInfoSubjectTemplate ||
          config.accessCodeSubjectTemplate
        : includeAccessCode
          ? propertyData.accessCodeSubjectTemplate ||
            propertyData.accessSubjectTemplate ||
            config.accessCodeSubjectTemplate
          : config.missingFormSubjectTemplate || config.finalReminderSubjectTemplate;
  const subject =
    renderMessageTemplate(subjectTemplate, data) ||
    defaultMessageSubject(data, resolvedMessageKind, includeAccessCode);
  const lodgifyMessageHtml = messageToLodgifyHtml(text);
  return {
    ...data,
    accessMessageText: text,
    accessMessageHtml: lodgifyMessageHtml,
    lodgifyMessageSubject: subject,
    lodgifyMessageText: text,
    lodgifyMessageHtml,
    messageKind: resolvedMessageKind,
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
  messageKind = "access",
}) {
  const config = releaseConfig(automationConfig);
  if (!config.enabled) return result("skipped", "Access code release disabled");
  const resolvedMessageKind = messageKind === "code-only" ? "code-only" : "access";
  const templateId =
    resolvedMessageKind === "code-only" ? "lodgify:code-only" : "lodgify:access-code";

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
      messageKind: resolvedMessageKind,
    });
    return result(
      "success",
      `[DRY RUN] Would post Lodgify ${resolvedMessageKind === "code-only" ? "code-only" : "access-code"} message to booking ${context.bookingId} | ${templateData.propertyDisplayName || context.propertyName || "Property"} | arrival ${templateData.Arrival || "unknown"}`,
      {
        templateData,
        bookingId: context.bookingId,
        deliveryChannel: "lodgify",
        decision: resolvedMessageKind === "code-only" ? "code-only" : "access-code",
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
    messageKind: resolvedMessageKind,
  });

  try {
    await sendBookingMessage(context.bookingId, {
      subject: templateData.lodgifyMessageSubject,
      message: withLodgifyPrefix(messagePrefix, templateData.lodgifyMessageHtml),
      type: config.lodgifyMessageType || "Owner",
      sendNotification: config.lodgifySendNotification !== false,
    });
    if (persistState !== false) {
      await markAccessCodeReleaseSent({
        bookingId: context.bookingId,
        templateId,
        channel: "lodgify",
      });
    }
    return result(
      "success",
      `Posted ${resolvedMessageKind === "code-only" ? "day-of code" : "access code"} to Lodgify booking thread ${context.bookingId}`,
      {
        bookingId: context.bookingId,
        deliveryChannel: "lodgify",
        decision: resolvedMessageKind === "code-only" ? "code-only" : "access-code",
      }
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

function checkinInfoAlreadySent(existing) {
  if (!existing || existing.status === "sent" || existing.sent_at) return false;
  const raw = existing.raw_source && typeof existing.raw_source === "object"
    ? existing.raw_source
    : {};
  return (
    Boolean(raw.checkinInfoSentAt) ||
    clean(existing.sendgrid_template_id) === "lodgify:checkin-info"
  );
}

export async function sendCheckinInfoForBooking({
  booking,
  automationConfig,
  dryRun = false,
  fallback = {},
  persistState = true,
  messagePrefix = "",
}) {
  const config = releaseConfig(automationConfig);
  const templateId = "lodgify:checkin-info";
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
  if (persistState !== false && checkinInfoAlreadySent(existing)) {
    return result(
      "skipped",
      `Skipped booking ${context.bookingId}: check-in information already sent`
    );
  }

  const templateData = buildAccessCodeTemplateData({
    booking,
    automationConfig,
    accessCode: "",
    fallback,
    includeAccessCode: false,
    messageKind: "checkin-info",
  });

  if (dryRun) {
    return result(
      "success",
      `[DRY RUN] Would post Lodgify no-code check-in message to booking ${context.bookingId} | ${templateData.propertyDisplayName || context.propertyName || "Property"} | arrival ${templateData.Arrival || "unknown"}`,
      {
        templateData,
        bookingId: context.bookingId,
        deliveryChannel: "lodgify",
        decision: "checkin-info",
      }
    );
  }

  try {
    await sendBookingMessage(context.bookingId, {
      subject: templateData.lodgifyMessageSubject,
      message: withLodgifyPrefix(messagePrefix, templateData.lodgifyMessageHtml),
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
        error: "Check-in information sent; access code delayed until check-in day.",
        raw: {
          reason: "checkin-info-lodgify-message",
          checkinInfoSentAt: new Date().toISOString(),
        },
      });
    }
    return result(
      "success",
      `Posted no-code check-in information to Lodgify booking thread ${context.bookingId}`,
      {
        bookingId: context.bookingId,
        deliveryChannel: "lodgify",
        decision: "checkin-info",
      }
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
        raw: { reason: "checkin-info-lodgify-message-failed" },
      }).catch(() => {});
    }
    return result(
      "failed",
      `Failed to post no-code check-in information to Lodgify booking ${context.bookingId}: ${detail}`
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
      message: withLodgifyPrefix(messagePrefix, templateData.lodgifyMessageHtml),
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

export async function sendWaiverReminderForBooking({
  booking,
  automationConfig,
  reminder = {},
  dryRun = false,
  fallback = {},
  persistState = true,
  messagePrefix = "",
}) {
  const config = releaseConfig(automationConfig);
  const waiverConfig = automationConfig.waiverReminders || {};
  const context = bookingContext(booking, fallback);
  const reminderDay = Number(reminder.daysBeforeCheckin ?? 0) || 0;
  const templateId = `lodgify:waiver-reminder:${reminderDay}`;

  if (!waiverConfig.enabled) return result("skipped", "Waiver reminders disabled");
  if (!context.bookingId) return result("skipped", "No booking ID available");
  if (!allowedByPropertyFilter(context, waiverConfig)) {
    return result("skipped", `Skipped booking ${context.bookingId}: property is not enabled for waiver reminders`);
  }

  const existing = await getAccessCodeRelease(context.bookingId);
  if (persistState !== false && (existing?.sent_at || existing?.status === "sent")) {
    return result("skipped", `Skipped booking ${context.bookingId}: access code already sent`);
  }
  if (persistState !== false && blockedAttemptWasToday(existing, templateId)) {
    return result(
      "skipped",
      `Skipped booking ${context.bookingId}: "${reminder.label || `${reminderDay}-day reminder`}" already sent today`
    );
  }

  const templateData = buildAccessCodeTemplateData({
    booking,
    automationConfig,
    accessCode: "",
    fallback,
    includeAccessCode: false,
  });
  const text = defaultWaiverReminderText(templateData, reminder);
  const subject = defaultWaiverReminderSubject(templateData, reminder);
  const lodgifyMessageHtml = messageToLodgifyHtml(text);
  const data = {
    ...templateData,
    lodgifyMessageSubject: subject,
    lodgifyMessageText: text,
    lodgifyMessageHtml,
    accessMessageText: text,
    accessMessageHtml: lodgifyMessageHtml,
  };
  const label = reminder.label || `${reminderDay}-day reminder`;

  if (dryRun) {
    return result(
      "success",
      `[DRY RUN] Would post Lodgify waiver reminder "${label}" to booking ${context.bookingId} | ${data.propertyDisplayName || context.propertyName || "Property"} | arrival ${data.Arrival || "unknown"}`,
      {
        templateData: data,
        bookingId: context.bookingId,
        deliveryChannel: "lodgify",
        decision: "waiver-reminder",
      }
    );
  }

  try {
    await sendBookingMessage(context.bookingId, {
      subject,
      message: withLodgifyPrefix(messagePrefix, lodgifyMessageHtml),
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
        error: `Waiver reminder "${label}" Lodgify message sent.`,
        raw: { reason: "waiver-reminder-lodgify-message", reminderDay, label },
      });
    }
    return result(
      "success",
      `Posted Lodgify waiver reminder "${label}" to booking thread ${context.bookingId}`,
      {
        bookingId: context.bookingId,
        deliveryChannel: "lodgify",
        decision: "waiver-reminder",
      }
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
        raw: { reason: "waiver-reminder-lodgify-message-failed", reminderDay, label },
      }).catch(() => {});
    }
    return result(
      "failed",
      `Failed to post Lodgify waiver reminder "${label}" for booking ${context.bookingId}: ${detail}`
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
  const releaseHour = Math.max(
    0,
    Math.min(23, Number(config.releaseHourCentral ?? 15))
  );
  const releaseMinute = Math.max(
    0,
    Math.min(59, Number(config.releaseMinuteCentral ?? 0))
  );
  const { reached, clock } = centralClockHasReached(releaseHour, releaseMinute);
  const dayOfReleaseHour = Math.max(
    0,
    Math.min(23, Number(config.dayOfCodeReleaseHourCentral ?? 11))
  );
  const dayOfReleaseMinute = Math.max(
    0,
    Math.min(59, Number(config.dayOfCodeReleaseMinuteCentral ?? 0))
  );
  const dayOfRelease = centralClockHasReached(dayOfReleaseHour, dayOfReleaseMinute);
  const isInsideImmediateWindow =
    daysUntilStay === 0 || (daysUntilStay === 1 && reached);

  if (daysUntilStay === 1 && !reached) {
    return result(
      "skipped",
      `Submitted stay starts tomorrow; access code release opens at ${String(releaseHour).padStart(2, "0")}:${String(releaseMinute).padStart(2, "0")} Central. Current Central time is ${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}.`
    );
  }

  if (daysUntilStay === null || daysUntilStay < 0 || !isInsideImmediateWindow) {
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

  if (isDelayedAccessCodeBooking({ booking, automationConfig, fallback: { contact, stayDetails, bookingId } })) {
    if (daysUntilStay === 0 && dayOfRelease.reached) {
      return sendAccessCodeForBooking({
        booking,
        automationConfig,
        fallback: {
          contact,
          stayDetails,
          bookingId,
        },
        messageKind: "code-only",
      });
    }

    return sendCheckinInfoForBooking({
      booking,
      automationConfig,
      fallback: {
        contact,
        stayDetails,
        bookingId,
      },
    });
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
