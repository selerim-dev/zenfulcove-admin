import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { PROPERTY_TO_CABIN } from "@/lib/types";
import { propertyTimeToUtc, todayIso } from "@/lib/dates";
import { fetchReservationById, LodgifyError } from "@/lib/customer/lodgify";

type BookingPayload = {
  kayakId: string;
  dateIso: string;
  reservationId: string;
  lastName: string;
  waiverAccepted: boolean;
};

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateReferenceCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += REFERENCE_ALPHABET[bytes[i] % REFERENCE_ALPHABET.length];
  }
  return code;
}

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

function isValidPayload(p: Partial<BookingPayload>): p is BookingPayload {
  if (typeof p.kayakId !== "string") return false;
  if (typeof p.dateIso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.dateIso)) {
    return false;
  }
  if (
    typeof p.reservationId !== "string" ||
    p.reservationId.trim().length === 0
  ) {
    return false;
  }
  if (typeof p.lastName !== "string" || p.lastName.trim().length === 0) {
    return false;
  }
  if (p.waiverAccepted !== true) return false;
  return true;
}

function isoLessOrEqual(a: string, b: string): boolean {
  return a <= b;
}

export async function POST(req: Request) {
  let body: Partial<BookingPayload>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isValidPayload(body)) {
    return NextResponse.json(
      { error: "Missing or invalid fields" },
      { status: 400 }
    );
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Portal booking database is not configured yet." },
      { status: 503 }
    );
  }

  let reservation;
  try {
    reservation = await fetchReservationById(body.reservationId);
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

  if (!lastNameMatches(reservation.guestName, body.lastName)) {
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
    !isoLessOrEqual(reservation.arrivalIso, body.dateIso) ||
    !isoLessOrEqual(body.dateIso, reservation.departureIso)
  ) {
    return NextResponse.json(
      {
        error: `Pick a date between ${reservation.arrivalIso} and ${reservation.departureIso}.`,
      },
      { status: 400 }
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: kayak, error: kayakError } = await supabase
    .from("kayaks")
    .select("id, code, daily_rate_cents, is_active")
    .eq("id", body.kayakId)
    .maybeSingle();

  if (kayakError || !kayak || !kayak.is_active) {
    return NextResponse.json({ error: "Kayak not available" }, { status: 404 });
  }

  const { count: existingCount } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("lodgify_reservation_id", reservation.id)
    .in("status", ["pending", "confirmed", "completed"]);

  const isComplimentary = (existingCount ?? 0) === 0;
  const amountCents = isComplimentary ? 0 : kayak.daily_rate_cents;
  const status = isComplimentary ? "confirmed" : "pending";

  const start = propertyTimeToUtc(body.dateIso, 9, 0);
  const end = propertyTimeToUtc(body.dateIso, 17, 0);

  const customerName =
    (reservation.guestName ?? "").trim() || body.lastName.trim();

  let inserted: { id: string; reference_code: string } | null = null;
  let lastError: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const referenceCode = generateReferenceCode();
    const { data, error } = await supabase
      .from("bookings")
      .insert({
        reference_code: referenceCode,
        kayak_id: kayak.id,
        customer_name: customerName,
        customer_email: null,
        customer_phone: null,
        stay_location: cabin,
        lodgify_reservation_id: reservation.id,
        is_complimentary: isComplimentary,
        waiver_accepted_at: new Date().toISOString(),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        rate_type: "daily",
        amount_cents: amountCents,
        status,
      })
      .select("id, reference_code")
      .single();

    if (!error) {
      inserted = data as { id: string; reference_code: string };
      break;
    }
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "That kayak is already booked for this day." },
        { status: 409 }
      );
    }
    if (
      error.code === "23505" &&
      (error.message ?? "").toLowerCase().includes("reference_code")
    ) {
      lastError = error;
      continue;
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!inserted) {
    return NextResponse.json(
      { error: lastError?.message ?? "Could not generate booking reference." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    bookingId: inserted.id,
    referenceCode: inserted.reference_code,
    lockboxCode: kayak.code ?? null,
    isComplimentary,
    amountCents,
    cabin,
    customerName,
    guestName: reservation.guestName,
  });
}
