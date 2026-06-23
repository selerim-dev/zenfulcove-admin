import { NextResponse } from "next/server";
import { authenticateReservation } from "@/lib/customer/reservationAuth";
import { dayBoundsUtc } from "@/lib/dates";
import { getFreeBusy } from "@/lib/google-calendar";
import { generateSlots } from "@/lib/spa";
import {
  getActiveTherapist,
  getService,
  listTherapistBusyIntervals,
} from "@/lib/spaBookings";
import { sweepExpiredMassageBookings } from "@/lib/spaExpiry";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  reservationId?: string;
  lastName?: string;
  serviceId?: string;
  dateIso?: string;
};

export async function POST(req: Request) {
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Massage booking is not configured yet." },
      { status: 503 }
    );
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const dateIso = String(body.dateIso || "").trim();
  const serviceId = String(body.serviceId || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return NextResponse.json({ error: "Pick a date." }, { status: 400 });
  }

  const auth = await authenticateReservation(body.reservationId ?? "", body.lastName ?? "");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { reservation } = auth;

  if (dateIso < reservation.arrivalIso || dateIso > reservation.departureIso) {
    return NextResponse.json(
      { error: "Choose a date within your stay." },
      { status: 400 }
    );
  }

  // Safety net so overdue requests free up their slot even if the cron lags.
  await sweepExpiredMassageBookings().catch((err) => console.error(err));

  const therapist = await getActiveTherapist();
  if (!therapist) {
    return NextResponse.json({
      ok: true,
      slots: [],
      unavailable: true,
      message: "In-cabin massage isn't available right now.",
    });
  }

  const service = serviceId ? await getService(serviceId) : null;
  if (!service || !service.is_active) {
    return NextResponse.json({ error: "Choose a service." }, { status: 400 });
  }

  const { start, end } = dayBoundsUtc(dateIso);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  let busy;
  try {
    const [googleBusy, dbBusy] = await Promise.all([
      therapist.google_calendar_id
        ? getFreeBusy(therapist.google_calendar_id, startIso, endIso)
        : Promise.resolve([]),
      listTherapistBusyIntervals(therapist.id, startIso, endIso),
    ]);
    busy = [...googleBusy, ...dbBusy];
  } catch (err) {
    return NextResponse.json(
      {
        error: `Couldn't check availability: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 }
    );
  }

  const slots = generateSlots({
    therapist,
    durationMin: service.duration_min,
    dateIso,
    busy,
  });

  return NextResponse.json({ ok: true, slots, serviceId: service.id, date: dateIso });
}
