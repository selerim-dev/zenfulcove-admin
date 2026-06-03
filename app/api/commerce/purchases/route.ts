import { NextResponse } from "next/server";
import { listCommercePurchases } from "@/lib/kv";
import { fetchReservationById, LodgifyError } from "@/lib/customer/lodgify";

type PurchasesPayload = {
  reservationId?: string;
  lastName?: string;
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
  let body: PurchasesPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const reservationId = String(body.reservationId || "").trim();
  const lastName = String(body.lastName || "").trim();
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
      { error: "We couldn't find that reservation." },
      { status: 404 }
    );
  }

  if (!lastNameMatches(reservation.guestName, lastName)) {
    return NextResponse.json(
      { error: "That last name doesn't match the reservation." },
      { status: 401 }
    );
  }

  const purchases = await listCommercePurchases(reservation.id);
  return NextResponse.json({ ok: true, purchases });
}
