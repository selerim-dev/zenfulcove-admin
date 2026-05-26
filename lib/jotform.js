import { JOTFORM_API_KEY } from "@/config/keys";
import { bookingCodesMatch } from "@/lib/booking-code";

// Use JOTFORM_EU=true in .env.local if your account is in EU (eu-api.jotform.com)
const BASE_URL =
  process.env.JOTFORM_EU === "true"
    ? "https://eu-api.jotform.com"
    : "https://api.jotform.com";

/**
 * Get all submissions for a form.
 * @param {string} formId
 */
export async function getFormSubmissions(formId, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 1000, 1000));
  const url = `${BASE_URL}/form/${formId}/submissions?apiKey=${JOTFORM_API_KEY}&limit=${limit}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    const urlSafe = url.replace(/apiKey=[^&]+/, "apiKey=***");
    throw new Error(
      `JotForm API error: ${res.status} ${res.statusText} | Form: ${formId} | ${urlSafe}${body ? ` | Body: ${body.slice(0, 300)}` : ""}`
    );
  }

  const data = await res.json();
  return data.content || [];
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BOOKING_CONFIRMATION_LABELS = [
  "Booking Confirmation ID (Located in the first message when you booked) *",
  "Booking Confirmation ID (Located in the first message when you booked)",
  "Booking Confirmation ID",
  "Booking Confirmation",
  "Confirmation ID",
  "Booking Code",
].map(normalizeLabel);

const BOOKING_CONFIRMATION_FIELD_IDS = [
  process.env.JOTFORM_BOOKING_CONFIRMATION_FIELD_ID,
].map((value) => String(value || "").trim()).filter(Boolean);

function getAnswerText(answer) {
  if (answer == null) return "";
  if (typeof answer === "string") return answer.trim();
  if (typeof answer === "number") return String(answer);
  if (Array.isArray(answer)) {
    return answer.map((item) => getAnswerText(item)).filter(Boolean).join(", ");
  }
  if (typeof answer === "object") {
    if (answer.first || answer.last) {
      return [answer.first, answer.last].filter(Boolean).join(" ").trim();
    }
    return Object.values(answer)
      .map((item) => getAnswerText(item))
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return "";
}

function payloadKeyFromEntry(entry) {
  const name = String(entry?.raw?.name || "").trim();
  if (name) return name.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");

  const label = String(entry?.raw?.text || entry?.label || "").trim();
  const key = label
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");

  return key || String(entry?.id || "").trim();
}

function getEntries(submission) {
  return Object.entries(submission?.answers || {}).map(([id, entry]) => ({
    id: String(id || "").trim(),
    label: normalizeLabel(entry?.text || entry?.name || ""),
    type: normalizeLabel(entry?.type || entry?.prettyFormat || ""),
    raw: entry,
  }));
}

function getSubmissionPhone(submission) {
  const contactPhone =
    submission?.contact?.phone ||
    submission?.contact?.phones?.[0]?.phone ||
    submission?.contact?.phones?.[0]?.fullNumber ||
    submission?.contact?.phones?.[0]?.e164Phone ||
    "";

  if (contactPhone) return String(contactPhone).trim();

  const entries = getEntries(submission);
  const phoneEntry = findEntry(entries, (entry) => {
    const haystack = `${entry.label} ${entry.type}`;
    return (
      haystack.includes("phone") ||
      haystack.includes("mobile") ||
      haystack.includes("cell") ||
      haystack.includes("tel")
    );
  });

  if (!phoneEntry) return "";
  return getAnswerText(phoneEntry.raw?.prettyFormat || phoneEntry.raw?.answer || "");
}

function findEntry(entries, matcher) {
  return entries.find((entry) => matcher(entry));
}

function isBookingConfirmationEntry(entry) {
  if (entry?.id && BOOKING_CONFIRMATION_FIELD_IDS.includes(entry.id)) return true;
  if (!entry?.label) return false;
  if (BOOKING_CONFIRMATION_LABELS.includes(entry.label)) return true;
  return (
    entry.label.includes("booking confirmation") ||
    entry.label.includes("confirmation id") ||
    entry.label.includes("booking code")
  );
}

export function extractClientContact(submission) {
  const entries = getEntries(submission);

  const fullNameEntry = findEntry(
    entries,
    (entry) =>
      entry.raw?.answer &&
      typeof entry.raw.answer === "object" &&
      (entry.raw.answer.first || entry.raw.answer.last)
  );

  let firstName = fullNameEntry?.raw?.answer?.first || "";
  let lastName = fullNameEntry?.raw?.answer?.last || "";

  if (!firstName) {
    firstName =
      findEntry(entries, (entry) =>
        ["first name", "firstname", "first"].includes(entry.label)
      )?.raw?.answer || "";
  }

  if (!lastName) {
    lastName =
      findEntry(entries, (entry) =>
        ["last name", "lastname", "last"].includes(entry.label)
      )?.raw?.answer || "";
  }

  const email =
    getAnswerText(
      findEntry(entries, (entry) =>
        entry.type.includes("email") || entry.label.includes("email")
      )?.raw?.answer
    ) || "";

  const phone = getSubmissionPhone(submission);

  return {
    email: String(email).trim().toLowerCase(),
    firstName: String(firstName || "").trim(),
    lastName: String(lastName || "").trim(),
    phone: String(phone || "").trim(),
    submissionId: String(submission?.id || submission?.submissionID || "").trim(),
    createdAt: submission?.created_at || submission?.createdAt || submission?.submissionTime || "",
  };
}

export function extractBookingCode(submission) {
  const entries = getEntries(submission);
  const bookingEntry = findEntry(entries, isBookingConfirmationEntry);
  if (!bookingEntry) return "";
  return getAnswerText(
    bookingEntry.raw?.answer || bookingEntry.raw?.prettyFormat || ""
  );
}

export function submissionToLocalFormPayload(submission, formId = "") {
  const entries = getEntries(submission);
  const payload = {};

  for (const entry of entries) {
    const key = payloadKeyFromEntry(entry);
    if (!key || key.startsWith("__")) continue;
    const value = getAnswerText(entry.raw?.answer || entry.raw?.prettyFormat || "");
    if (value) payload[key] = value;
  }

  const contact = extractClientContact(submission);
  const bookingCode = extractBookingCode(submission);
  if (contact.email && !payload.email) payload.email = contact.email;
  if (contact.firstName && !payload.firstName) payload.firstName = contact.firstName;
  if (contact.lastName && !payload.lastName) payload.lastName = contact.lastName;
  if (contact.phone && !payload.phone) payload.phone = contact.phone;
  if (bookingCode && !payload.bookingCode) payload.bookingCode = bookingCode;

  payload.__jotform = {
    formId: String(formId || "").trim(),
    submissionId: String(submission?.id || submission?.submissionID || "").trim(),
    createdAt:
      submission?.created_at ||
      submission?.createdAt ||
      submission?.submissionTime ||
      "",
  };

  return payload;
}

/**
 * Check if a booking ID exists in pre-fetched submissions (in-memory, no API call).
 * @param {string} bookingId
 * @param {object[]} submissions  From getFormSubmissions()
 * @returns {boolean}
 */
export function bookingHasWaiver(bookingId, submissions) {
  const normalizedBookingId = String(bookingId || "").trim();
  if (!normalizedBookingId) return false;

  return (submissions || []).some((submission) => {
    const entries = getEntries(submission);
    const bookingEntry = findEntry(entries, isBookingConfirmationEntry);

    if (bookingEntry) {
      const bookingValue = getAnswerText(
        bookingEntry.raw?.answer || bookingEntry.raw?.prettyFormat || ""
      );
      return bookingCodesMatch(bookingValue, normalizedBookingId);
    }

    // Fallback for older submissions that used a different field label.
    const answers = submission.answers || {};
    return Object.values(answers).some((answer) => {
      const val = getAnswerText(answer.answer || answer.prettyFormat || "");
      return bookingCodesMatch(val, normalizedBookingId);
    });
  });
}

/**
 * Check if a booking ID has a matching waiver submission (fetches from API).
 * @param {string} formId
 * @param {string} bookingId
 * @returns {boolean}
 */
export async function hasWaiverSubmission(formId, bookingId) {
  const submissions = await getFormSubmissions(formId);
  return bookingHasWaiver(bookingId, submissions);
}
