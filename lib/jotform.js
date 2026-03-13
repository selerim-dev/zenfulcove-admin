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

/**
 * Check if a booking ID exists in pre-fetched submissions (in-memory, no API call).
 * @param {string} bookingId
 * @param {object[]} submissions  From getFormSubmissions()
 * @returns {boolean}
 */
export function bookingHasWaiver(bookingId, submissions) {
  return (submissions || []).some((submission) => {
    const answers = submission.answers || {};
    return Object.values(answers).some((answer) => {
      const val = answer.answer || answer.prettyFormat || "";
      return String(val).includes(String(bookingId));
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
