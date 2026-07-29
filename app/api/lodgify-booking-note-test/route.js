import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import {
  appendBookingNote,
  getBookingV1,
  getBookings,
  setBookingNote,
} from "@/lib/lodgify";

// Everything except `note` must be identical before/after a note update; any
// drift here means PUT /v1/reservation/booking/{id} touched more than we sent.
function snapshot(booking) {
  return {
    id: booking?.id ?? null,
    status: booking?.status ?? null,
    arrival: booking?.arrival ?? null,
    departure: booking?.departure ?? null,
    property_id: booking?.property_id ?? null,
    guest_name:
      booking?.guest?.guest_name?.first_name ??
      booking?.guest?.guest_name ??
      booking?.guest?.name ??
      null,
    guest_email: booking?.guest?.email ?? null,
    people: booking?.people ?? null,
    total_amount: booking?.total_amount ?? null,
    total_paid: booking?.total_paid ?? null,
    is_deleted: booking?.is_deleted ?? null,
    rooms: Array.isArray(booking?.rooms)
      ? booking.rooms.map((room) => ({
          room_type_id: room?.room_type_id ?? null,
          key_code: room?.key_code ?? null,
        }))
      : null,
    note: booking?.note ?? null,
  };
}

function driftBetween(before, after) {
  const drift = {};
  for (const key of Object.keys(before)) {
    if (key === "note") continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      drift[key] = { before: before[key], after: after[key] };
    }
  }
  return drift;
}

// GET ?bookingId=123 → snapshot of one booking (read-only)
// GET ?list=1&from=YYYY-MM-DD&to=YYYY-MM-DD → candidate bookings in range
export async function GET(request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);

  if (searchParams.get("list")) {
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    if (!from || !to) {
      return NextResponse.json(
        { error: "Pass ?list=1&from=YYYY-MM-DD&to=YYYY-MM-DD" },
        { status: 400 }
      );
    }
    const bookings = await getBookings({ stayFrom: from, stayTo: to, size: 25 });
    return NextResponse.json({
      ok: true,
      bookings: (Array.isArray(bookings) ? bookings : []).map((booking) => ({
        id: booking?.id ?? null,
        status: booking?.status ?? null,
        arrival: booking?.arrival ?? null,
        departure: booking?.departure ?? null,
        property_id: booking?.property_id ?? null,
      })),
    });
  }

  const bookingId = searchParams.get("bookingId");
  if (!bookingId) {
    return NextResponse.json(
      { error: "Pass ?bookingId=… or ?list=1&from=…&to=…" },
      { status: 400 }
    );
  }

  const booking = await getBookingV1(bookingId);
  if (!booking?.id) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, booking: snapshot(booking) });
}

// POST { bookingId, text?, keep? } → append a test block to Booking Notes,
// verify nothing else changed, then restore the original note unless keep.
export async function POST(request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const bookingId = String(body.bookingId || "").trim();
  if (!bookingId) {
    return NextResponse.json({ error: "Missing bookingId." }, { status: 400 });
  }
  const keep = Boolean(body.keep);
  const text =
    String(body.text || "").trim() ||
    `[TEST ${new Date().toISOString()}] Booking-notes API check — safe to ignore / prueba del sistema — puede ignorarse`;

  const before = await getBookingV1(bookingId);
  if (!before?.id) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  const beforeSnap = snapshot(before);

  const result = await appendBookingNote(before.id, text, {});
  const after = await getBookingV1(before.id);
  const afterSnap = snapshot(after);

  let restored = null;
  if (!keep) {
    await setBookingNote(before.id, before.note || "");
    const check = await getBookingV1(before.id);
    restored = {
      note: check?.note ?? null,
      matchesOriginal:
        String(check?.note || "").trim() === String(before.note || "").trim(),
    };
  }

  return NextResponse.json({
    ok: true,
    appended: result.appended,
    noteBefore: beforeSnap.note,
    noteAfter: afterSnap.note,
    fieldDrift: driftBetween(beforeSnap, afterSnap),
    restored,
  });
}
