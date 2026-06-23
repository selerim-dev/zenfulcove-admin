import {
  fetchReservationById,
  LodgifyError,
  type NormalizedReservation,
} from "@/lib/customer/lodgify";
import { todayIso } from "@/lib/dates";

/**
 * Same lenient last-name check the commerce routes use: the guest's input must
 * be one of the words in the reservation name, or a suffix of it.
 */
export function lastNameMatches(
  guestName: string | null | undefined,
  input: string
): boolean {
  if (!guestName) return false;
  const g = guestName.toLowerCase().trim();
  const i = input.toLowerCase().trim();
  if (!i) return false;
  const words = g.split(/\s+/);
  return words.includes(i) || g.endsWith(i);
}

export type ReservationAuthResult =
  | { ok: true; reservation: NormalizedReservation }
  | { ok: false; status: number; error: string };

/**
 * Verify a guest by reservation number + last name against Lodgify. Mirrors the
 * gate used by /api/commerce/* so the spa flow authenticates identically.
 */
export async function authenticateReservation(
  reservationId: string,
  lastName: string
): Promise<ReservationAuthResult> {
  const id = String(reservationId || "").trim();
  const name = String(lastName || "").trim();
  if (!id || !name) {
    return {
      ok: false,
      status: 400,
      error: "Reservation number and last name are required.",
    };
  }

  let reservation: NormalizedReservation | null;
  try {
    reservation = await fetchReservationById(id);
  } catch (err) {
    const detail = err instanceof LodgifyError ? err.detail : String(err);
    return {
      ok: false,
      status: 502,
      error: `Couldn't reach Lodgify (${detail.slice(0, 120)})`,
    };
  }

  if (!reservation) {
    return { ok: false, status: 404, error: "We couldn't find that reservation." };
  }
  if (!lastNameMatches(reservation.guestName, name)) {
    return {
      ok: false,
      status: 401,
      error: "That last name doesn't match the reservation.",
    };
  }
  if (reservation.departureIso < todayIso()) {
    return { ok: false, status: 400, error: "That reservation has already ended." };
  }

  return { ok: true, reservation };
}
