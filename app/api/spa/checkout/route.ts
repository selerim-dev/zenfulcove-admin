import { NextResponse } from "next/server";
import { authenticateReservation } from "@/lib/customer/reservationAuth";
import { dayBoundsUtc, PROPERTY_TIMEZONE } from "@/lib/dates";
import { getFreeBusy } from "@/lib/google-calendar";
import { bookingInterval, generateSlots } from "@/lib/spa";
import {
  createMassageBooking,
  getActiveTherapist,
  getService,
  getSpaMasterHours,
  isSpaEnabled,
  listTherapistBusyIntervals,
  spaPreviewMatches,
  updateMassageBooking,
} from "@/lib/spaBookings";
import {
  APP_STRIPE_METADATA_MARKER,
  createStripeClient,
  getAppBaseUrl,
  getMassageStripeMode,
  hasStripeSecretEnv,
} from "@/lib/stripe";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { PROPERTY_TO_CABIN } from "@/lib/types";

export const runtime = "nodejs";

type Payload = {
  reservationId?: string;
  lastName?: string;
  serviceId?: string;
  slotIso?: string;
  preview?: string;
};

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PROPERTY_TIMEZONE,
});

export async function POST(req: Request) {
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Massage booking is not configured yet." },
      { status: 503 }
    );
  }
  if (!hasStripeSecretEnv(getMassageStripeMode())) {
    return NextResponse.json(
      {
        error: `Payment checkout is not configured for ${getMassageStripeMode()} mode yet.`,
      },
      { status: 503 }
    );
  }
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Gate on the feature flag, unless this is a preview-secret request (staff
  // testing the live flow before launch).
  if (!spaPreviewMatches(body.preview) && !(await isSpaEnabled())) {
    return NextResponse.json(
      { error: "In-cabin massage isn't available right now." },
      { status: 403 }
    );
  }

  const reservationId = String(body.reservationId || "").trim();
  const lastName = String(body.lastName || "").trim();
  const serviceId = String(body.serviceId || "").trim();
  const slotIso = String(body.slotIso || "").trim();
  const slotDate = new Date(slotIso);
  if (!serviceId || Number.isNaN(slotDate.getTime())) {
    return NextResponse.json(
      { error: "Choose a service and an available time." },
      { status: 400 }
    );
  }

  const auth = await authenticateReservation(reservationId, lastName);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { reservation } = auth;

  const dateIso = isoDateFormatter.format(slotDate);
  if (dateIso < reservation.arrivalIso || dateIso > reservation.departureIso) {
    return NextResponse.json(
      { error: "Choose a time within your stay." },
      { status: 400 }
    );
  }

  const therapist = await getActiveTherapist();
  if (!therapist) {
    return NextResponse.json(
      { error: "In-cabin massage isn't available right now." },
      { status: 409 }
    );
  }
  const service = await getService(serviceId);
  if (!service || !service.is_active) {
    return NextResponse.json(
      { error: "That service is no longer available." },
      { status: 404 }
    );
  }

  // Re-validate the slot is still open (guards against a slot taken since the
  // guest loaded availability). Recompute from the same source of truth.
  const { start, end } = dayBoundsUtc(dateIso);
  let stillAvailable = false;
  try {
    const [googleBusy, dbBusy] = await Promise.all([
      therapist.google_calendar_id
        ? getFreeBusy(
            therapist.google_calendar_id,
            start.toISOString(),
            end.toISOString()
          )
        : Promise.resolve([]),
      listTherapistBusyIntervals(
        therapist.id,
        start.toISOString(),
        end.toISOString()
      ),
    ]);
    const slots = generateSlots({
      therapist,
      masterHours: await getSpaMasterHours(),
      durationMin: service.duration_min,
      dateIso,
      busy: [...googleBusy, ...dbBusy],
    });
    stillAvailable = slots.some((slot) => slot.iso === slotDate.toISOString());
  } catch (err) {
    return NextResponse.json(
      {
        error: `Couldn't verify availability: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 }
    );
  }

  if (!stillAvailable) {
    return NextResponse.json(
      { error: "That time was just taken. Please pick another." },
      { status: 409 }
    );
  }

  const { startsAtIso, endsAtIso } = bookingInterval(
    slotDate.toISOString(),
    service.duration_min,
    therapist.buffer_min
  );
  const cabin = PROPERTY_TO_CABIN[reservation.propertyId] || null;
  const customerName = (reservation.guestName ?? "").trim() || lastName;

  const booking = await createMassageBooking({
    therapist_id: therapist.id,
    service_id: service.id,
    lodgify_reservation_id: reservation.id,
    customer_name: customerName,
    customer_email: null,
    customer_phone: null,
    stay_location: cabin,
    service_label: service.name,
    duration_min: service.duration_min,
    starts_at: startsAtIso,
    ends_at: endsAtIso,
    amount_cents: service.price_cents,
    payout_cents: service.payout_cents,
  });

  const stripe = createStripeClient(getMassageStripeMode());
  const baseUrl = getAppBaseUrl(req);
  const successUrl = `${baseUrl}/spa/confirmation/${booking.id}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelParams = new URLSearchParams({
    reservation: reservationId,
    lastName,
    payment: "cancelled",
  });
  const cancelUrl = `${baseUrl}/spa?${cancelParams.toString()}`;
  const metadata = {
    app: APP_STRIPE_METADATA_MARKER,
    kind: "massage_booking",
    bookingId: booking.id,
    reservationId: reservation.id,
  };

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: booking.id,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        payment_intent_data: { metadata },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: service.price_cents,
              product_data: {
                name: `${service.name} · In-cabin massage`,
                description: cabin
                  ? `${cabin} — ${booking.customer_name}`
                  : booking.customer_name,
                metadata: { serviceId: service.id, bookingId: booking.id },
              },
            },
          },
        ],
      },
      { idempotencyKey: `massage-checkout-${booking.id}` }
    );

    if (!session.url) {
      await updateMassageBooking(booking.id, {
        status: "cancelled",
        stripe_checkout_session_id: session.id,
      });
      return NextResponse.json(
        { error: "Stripe checkout did not return a redirect URL." },
        { status: 500 }
      );
    }

    await updateMassageBooking(booking.id, {
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
    });

    return NextResponse.json({
      ok: true,
      bookingId: booking.id,
      checkoutUrl: session.url,
    });
  } catch (err) {
    await updateMassageBooking(booking.id, { status: "cancelled" });
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Could not start checkout: ${err.message}`
            : "Could not start checkout.",
      },
      { status: 502 }
    );
  }
}
