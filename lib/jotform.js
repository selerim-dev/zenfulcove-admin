import { JOTFORM_API_KEY } from "@/config/keys";

// Use JOTFORM_EU=true in .env.local if your account is in EU (eu-api.jotform.com)
const BASE_URL =
  process.env.JOTFORM_EU === "true"
    ? "https://eu-api.jotform.com"
    : "https://api.jotform.com";

/**
 * Get all submissions for a form.
 * @param {string} formId
 */
export async function getFormSubmissions(formId) {
  const url = `${BASE_URL}/form/${formId}/submissions?apiKey=${JOTFORM_API_KEY}&limit=1000`;

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

function normalizeMatchValue(value) {
  return String(value || "").trim().toLowerCase();
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

/**
 * Check if a booking ID exists in pre-fetched submissions (in-memory, no API call).
 * @param {string} bookingId
 * @param {object[]} submissions  From getFormSubmissions()
 * @returns {boolean}
 */
export function bookingHasWaiver(bookingId, submissions) {
  const normalizedBookingId = normalizeMatchValue(bookingId);
  if (!normalizedBookingId) return false;

  return (submissions || []).some((submission) => {
    const entries = getEntries(submission);
    const bookingEntry = findEntry(entries, isBookingConfirmationEntry);

    if (bookingEntry) {
      const bookingValue = normalizeMatchValue(
        getAnswerText(bookingEntry.raw?.answer || bookingEntry.raw?.prettyFormat || "")
      );
      return (
        bookingValue === normalizedBookingId ||
        bookingValue.includes(normalizedBookingId)
      );
    }

    // Fallback for older submissions that used a different field label.
    const answers = submission.answers || {};
    return Object.values(answers).some((answer) => {
      const val = normalizeMatchValue(answer.answer || answer.prettyFormat || "");
      return val.includes(normalizedBookingId);
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
