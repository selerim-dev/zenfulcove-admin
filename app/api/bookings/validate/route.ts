import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { fetchReservationById, LodgifyError } from "@/lib/customer/lodgify";
import { PROPERTY_TO_CABIN } from "@/lib/types";
import { todayIso } from "@/lib/dates";

type ValidatePayload = {
  reservationId: string;
  lastName: string;
  dateIso?: string;
};

function lastNameMatches(
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

export async function POST(req: Request) {
  let body: Partial<ValidatePayload>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reservationId = String(body.reservationId ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const dateIso = typeof body.dateIso === "string" ? body.dateIso : undefined;

  if (!reservationId || !lastName) {
    return NextResponse.json(
      { error: "Reservation number and last name are required." },
      { status: 400 }
    );
  }

  let reservation;
  try {
    reservation = await fetchReservationById(reservationId);
  } catch (err) {
    const detail = err instanceof LodgifyError ? err.detail : String(err);
    return NextResponse.json(
      { error: `Couldn't reach Lodgify (${detail.slice(0, 120)})` },
      { status: 502 }
    );
  }

  if (!reservation) {
    return NextResponse.json(
      {
        error:
          "We couldn't find that reservation. Double-check the booking number on your confirmation email.",
      },
      { status: 404 }
    );
  }

  if (!lastNameMatches(reservation.guestName, lastName)) {
    return NextResponse.json(
      { error: "That last name doesn't match the reservation." },
      { status: 401 }
    );
  }

  const cabin = PROPERTY_TO_CABIN[reservation.propertyId];
  if (!cabin) {
    return NextResponse.json(
      { error: "That reservation isn't for one of our cabins." },
      { status: 400 }
    );
  }

  const today = todayIso();
  if (reservation.departureIso < today) {
    return NextResponse.json(
      { error: "That reservation has already ended." },
      { status: 400 }
    );
  }

  if (
    dateIso &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateIso) &&
    (dateIso < reservation.arrivalIso || dateIso > reservation.departureIso)
  ) {
    return NextResponse.json(
      {
        error: `Pick a date between ${reservation.arrivalIso} and ${reservation.departureIso}.`,
      },
      { status: 400 }
    );
  }

  let isFree: boolean | null = null;
  if (hasSupabaseAdminEnv()) {
    const supabase = createSupabaseAdminClient();
    const { count } = await supabase
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("lodgify_reservation_id", reservation.id)
      .in("status", ["pending", "confirmed", "completed"]);

    isFree = (count ?? 0) === 0;
  }

  return NextResponse.json({
    ok: true,
    isFree,
    cabin,
    guestName: reservation.guestName,
    arrivalIso: reservation.arrivalIso,
    departureIso: reservation.departureIso,
  });
}
