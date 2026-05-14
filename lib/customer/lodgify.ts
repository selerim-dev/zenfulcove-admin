const LODGIFY_BASE = "https://api.lodgify.com";

export class LodgifyError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`Lodgify ${status}: ${detail.slice(0, 200)}`);
    this.name = "LodgifyError";
    this.status = status;
    this.detail = detail;
  }
}

export async function lodgifyGet<T>(path: string): Promise<T> {
  const apiKey = process.env.LODGIFY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "LODGIFY_API_KEY is not set. Add it to .env.local and to Vercel env vars."
    );
  }
  const res = await fetch(`${LODGIFY_BASE}${path}`, {
    headers: {
      "X-ApiKey": apiKey,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new LodgifyError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export type LodgifyRoom = {
  id: number;
  name?: string;
  occupancy_max?: number;
};

export type LodgifyProperty = {
  id: number;
  name?: string;
  internal_name?: string;
  rooms?: LodgifyRoom[];
  address?: string;
  city?: string;
};

// Lodgify reservation shape — fields we actually use. Lodgify may return more.
export type LodgifyReservation = {
  id: number | string;
  property_id?: number;
  propertyId?: number; // some Lodgify endpoints camelCase
  arrival?: string;
  departure?: string;
  arrival_date?: string;
  departure_date?: string;
  status?: string;
  guest?: { name?: string; email?: string; phone?: string };
  guest_name?: string;
};

export type NormalizedReservation = {
  id: string;
  propertyId: number;
  arrivalIso: string; // YYYY-MM-DD
  departureIso: string; // YYYY-MM-DD
  status: string;
  guestName: string | null;
};

function normalizeIso(value: string | undefined): string | null {
  if (!value) return null;
  // Lodgify returns either YYYY-MM-DD or ISO datetime; normalize to date only.
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function normalizeReservation(
  raw: LodgifyReservation
): NormalizedReservation | null {
  const id = String(raw.id ?? "").trim();
  const propertyId = raw.property_id ?? raw.propertyId;
  const arrivalIso = normalizeIso(raw.arrival ?? raw.arrival_date);
  const departureIso = normalizeIso(raw.departure ?? raw.departure_date);

  if (!id || !propertyId || !arrivalIso || !departureIso) {
    return null;
  }

  return {
    id,
    propertyId,
    arrivalIso,
    departureIso,
    status: raw.status ?? "",
    guestName: raw.guest?.name ?? raw.guest_name ?? null,
  };
}

// Try a few common Lodgify reservation lookup paths so we tolerate API
// version differences. Returns null if not found, throws on real errors.
export async function fetchReservationById(
  reservationId: string
): Promise<NormalizedReservation | null> {
  const id = encodeURIComponent(reservationId.trim());
  const candidatePaths = [
    `/v2/reservations/bookings/${id}`,
    `/v1/reservation/${id}`,
  ];

  for (const path of candidatePaths) {
    try {
      const raw = await lodgifyGet<LodgifyReservation>(path);
      const normalized = normalizeReservation(raw);
      if (normalized) return normalized;
    } catch (err) {
      if (err instanceof LodgifyError && err.status === 404) {
        continue;
      }
      throw err;
    }
  }

  return null;
}

// List active / upcoming reservations across all properties.
export async function listReservations(): Promise<NormalizedReservation[]> {
  const candidatePaths = [
    "/v2/reservations/bookings?stayFilter=Upcoming&size=200&includeCount=false",
    "/v2/reservations/bookings?size=200",
    "/v1/reservation/list",
  ];

  for (const path of candidatePaths) {
    try {
      const data = await lodgifyGet<unknown>(path);
      const items: LodgifyReservation[] = Array.isArray(data)
        ? (data as LodgifyReservation[])
        : Array.isArray((data as { items?: LodgifyReservation[] })?.items)
          ? (data as { items: LodgifyReservation[] }).items
          : [];

      const out: NormalizedReservation[] = [];
      for (const raw of items) {
        const normalized = normalizeReservation(raw);
        if (normalized) out.push(normalized);
      }
      return out;
    } catch (err) {
      if (
        err instanceof LodgifyError &&
        (err.status === 404 || err.status === 400)
      ) {
        continue;
      }
      throw err;
    }
  }

  return [];
}
