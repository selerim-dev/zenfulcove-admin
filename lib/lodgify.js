import { LODGIFY_API_KEY } from "@/config/keys";

const BASE_URL = "https://api.lodgify.com";

export class LodgifyApiError extends Error {
  constructor(status, statusText, url, body = "") {
    super(
      `Lodgify API error: ${status} ${statusText} | URL: ${url}${body ? ` | Body: ${body.slice(0, 200)}` : ""}`
    );
    this.name = "LodgifyApiError";
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.body = body;
  }
}

async function lodgifyFetch(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const urlStr = url.toString();

  const res = await fetch(urlStr, {
    headers: {
      "X-ApiKey": LODGIFY_API_KEY,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new LodgifyApiError(res.status, res.statusText, urlStr, body);
  }

  return res.json();
}

function normalizeBookingParams(paramsOrStartDate, endDate) {
  if (typeof paramsOrStartDate === "object" && paramsOrStartDate !== null) {
    return {
      page: 1,
      size: 100,
      includeCount: false,
      includeTransactions: false,
      includeExternal: false,
      includeQuoteDetails: false,
      ...paramsOrStartDate,
    };
  }

  return {
    page: 1,
    size: 100,
    includeCount: false,
    includeTransactions: false,
    includeExternal: false,
    includeQuoteDetails: false,
    stayFrom: paramsOrStartDate,
    stayTo: endDate,
  };
}

/** Get all properties */
export async function getProperties() {
  return lodgifyFetch("/v2/properties");
}

/**
 * Get availability for a property within a date range.
 * @param {number} propertyId
 * @param {string} startDate  YYYY-MM-DD
 * @param {string} endDate    YYYY-MM-DD
 */
export async function getAvailability(propertyId, startDate, endDate) {
  return lodgifyFetch(`/v2/availability/${propertyId}`, {
    startDate,
    endDate,
  });
}

/**
 * Get bookings with check-in on a specific date.
 * Uses Lodgify GET /v2/reservations/bookings with stayFrom/stayTo to filter by arrival.
 * @param {string} startDate  YYYY-MM-DD (check-in date)
 * @param {string} endDate    YYYY-MM-DD
 */
export async function getBookings(paramsOrStartDate, endDate) {
  const data = await lodgifyFetch(
    "/v2/reservations/bookings",
    normalizeBookingParams(paramsOrStartDate, endDate)
  );
  return Array.isArray(data?.items) ? data.items : data ?? [];
}

export async function getBookingById(bookingId) {
  const id = encodeURIComponent(String(bookingId || "").trim());
  if (!id) return null;

  const candidatePaths = [
    `/v2/reservations/bookings/${id}`,
    `/v1/reservation/booking/${id}`,
    `/v1/reservation/${id}`,
  ];

  for (const path of candidatePaths) {
    try {
      return await lodgifyFetch(path);
    } catch (err) {
      if (
        err instanceof LodgifyApiError &&
        (err.status === 400 || err.status === 404)
      ) {
        continue;
      }
      throw err;
    }
  }

  return null;
}

export async function sendBookingMessage(
  bookingId,
  {
    subject,
    message,
    type = "Owner",
    sendNotification = true,
  } = {}
) {
  const id = encodeURIComponent(String(bookingId || "").trim());
  const normalizedMessage = String(message || "").trim();
  if (!id) throw new Error("Missing Lodgify booking ID.");
  if (!normalizedMessage) throw new Error("Missing Lodgify message body.");

  const url = `${BASE_URL}/v1/reservation/booking/${id}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-ApiKey": LODGIFY_API_KEY,
      Accept: "application/json",
      "Content-Type": "application/*+json",
    },
    body: JSON.stringify([
      {
        subject: String(subject || "Zenfulcove Glamping stay details").trim(),
        message: normalizedMessage,
        type,
        send_notification: Boolean(sendNotification),
      },
    ]),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new LodgifyApiError(res.status, res.statusText, url, body);
  }

  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export async function getAllBookings(paramsOrStartDate, endDate) {
  const baseParams = normalizeBookingParams(paramsOrStartDate, endDate);
  const pageSize = Math.max(1, Number(baseParams.size) || 100);
  const items = [];
  let page = Number(baseParams.page) || 1;

  while (true) {
    const batch = await getBookings({
      ...baseParams,
      page,
      size: pageSize,
    });

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    items.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    page += 1;
  }

  return items;
}
