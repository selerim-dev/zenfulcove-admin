import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { PROPERTY_TO_CABIN, type Kayak } from "@/lib/types";
import { propertyTimeToUtc, todayIso } from "@/lib/dates";
import { fetchReservationById, LodgifyError } from "@/lib/customer/lodgify";
import {
  createStripeClient,
  getKayakStripeMode,
  getAppBaseUrl,
  hasStripeSecretEnv,
  isKayakPaidCheckoutEnabled,
} from "@/lib/stripe";
import { createBookingCancelToken } from "@/lib/bookingCancelToken";

type BookingPayload = {
  kayakId?: string;
  kayakIds?: string[];
  dateIso: string;
  reservationId: string;
  lastName: string;
  waiverAccepted: boolean;
};

type InsertedBooking = {
  id: string;
  reference_code: string;
  kayak_id: string;
};

const MAX_KAYAKS_PER_CHECKOUT = 5;
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

function requestedKayakIds(p: Partial<BookingPayload>): string[] {
  const rawIds = Array.isArray(p.kayakIds)
    ? p.kayakIds
    : typeof p.kayakId === "string"
      ? [p.kayakId]
      : [];

  return Array.from(
    new Set(rawIds.map((id) => String(id || "").trim()).filter(Boolean))
  );
}

function isValidPayload(p: Partial<BookingPayload>): p is BookingPayload {
  const kayakIds = requestedKayakIds(p);
  if (kayakIds.length === 0 || kayakIds.length > MAX_KAYAKS_PER_CHECKOUT) {
    return false;
  }
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

function stripePriceData({
  kayak,
  amountCents,
  cabin,
  dateIso,
  stripeMode,
}: {
  kayak: Kayak;
  amountCents: number;
  cabin: string;
  dateIso: string;
  stripeMode: "test" | "live";
}) {
  if (stripeMode === "live" && kayak.stripe_product_id) {
    return {
      currency: "usd",
      unit_amount: amountCents,
      product: kayak.stripe_product_id,
    };
  }

  return {
    currency: "usd",
    unit_amount: amountCents,
    product_data: {
      name: `${kayak.name} rental`,
      description: `${cabin} · ${dateIso}`,
    },
  };
}

async function cancelInsertedBookings(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  bookingIds: string[],
  notes: string
) {
  if (bookingIds.length === 0) return;
  await supabase
    .from("bookings")
    .update({ status: "cancelled", notes })
    .in("id", bookingIds)
    .eq("status", "pending");
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

  const kayakIds = requestedKayakIds(body);

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Portal booking database is not configured yet." },
      { status: 503 }
    );
  }

  if (!isKayakPaidCheckoutEnabled()) {
    return NextResponse.json(
      {
        error:
          "Online paid kayak checkout is currently paused. Please contact Zenfulcove Glamping staff to book a rental.",
      },
      { status: 503 }
    );
  }

  if (!hasStripeSecretEnv()) {
    const stripeMode = getKayakStripeMode();
    return NextResponse.json(
      {
        error: `Payment checkout is not configured for ${stripeMode} mode yet.`,
      },
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
      { error: "That reservation isn't for one of our houses." },
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
  const { data: kayakRows, error: kayakError } = await supabase
    .from("kayaks")
    .select("*")
    .in("id", kayakIds)
    .eq("is_active", true);

  if (kayakError) {
    return NextResponse.json({ error: kayakError.message }, { status: 500 });
  }

  const kayaksById = new Map(
    ((kayakRows as Kayak[] | null) || []).map((kayak) => [kayak.id, kayak])
  );
  const kayaks = kayakIds.map((id) => kayaksById.get(id)).filter(Boolean) as Kayak[];

  if (kayaks.length !== kayakIds.length) {
    return NextResponse.json(
      { error: "One or more kayaks are no longer available." },
      { status: 404 }
    );
  }

  const start = propertyTimeToUtc(body.dateIso, 9, 0);
  const end = propertyTimeToUtc(body.dateIso, 17, 0);

  const { data: conflicts, error: conflictError } = await supabase
    .from("bookings")
    .select("kayak_id")
    .in("kayak_id", kayakIds)
    .in("status", ["pending", "confirmed", "completed"])
    .lt("starts_at", end.toISOString())
    .gt("ends_at", start.toISOString());

  if (conflictError) {
    return NextResponse.json({ error: conflictError.message }, { status: 500 });
  }

  const conflictIds = new Set(
    ((conflicts as { kayak_id: string }[] | null) || []).map(
      (booking) => booking.kayak_id
    )
  );
  if (conflictIds.size > 0) {
    const names = kayaks
      .filter((kayak) => conflictIds.has(kayak.id))
      .map((kayak) => kayak.name)
      .join(", ");
    return NextResponse.json(
      { error: `${names || "One of those kayaks"} is already booked for this day.` },
      { status: 409 }
    );
  }

  const customerName =
    (reservation.guestName ?? "").trim() || body.lastName.trim();

  let inserted: InsertedBooking[] | null = null;
  let lastError: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = kayaks.map((kayak) => ({
      reference_code: generateReferenceCode(),
      kayak_id: kayak.id,
      customer_name: customerName,
      customer_email: null,
      customer_phone: null,
      stay_location: cabin,
      lodgify_reservation_id: reservation.id,
      is_complimentary: false,
      waiver_accepted_at: new Date().toISOString(),
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      rate_type: "daily",
      amount_cents: kayak.daily_rate_cents,
      status: "pending",
    }));

    const { data, error } = await supabase
      .from("bookings")
      .insert(rows)
      .select("id, reference_code, kayak_id");

    if (!error) {
      inserted = data as InsertedBooking[];
      break;
    }

    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "One or more selected kayaks were just booked for this day." },
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

  if (!inserted || inserted.length === 0) {
    return NextResponse.json(
      { error: lastError?.message ?? "Could not generate booking references." },
      { status: 500 }
    );
  }

  const insertedByKayakId = new Map(
    inserted.map((booking) => [booking.kayak_id, booking])
  );
  const orderedInserted = kayaks
    .map((kayak) => insertedByKayakId.get(kayak.id))
    .filter(Boolean) as InsertedBooking[];
  const primary = orderedInserted[0];
  const bookingIds = orderedInserted.map((booking) => booking.id);
  const referenceCodes = orderedInserted.map((booking) => booking.reference_code);
  const amountCents = kayaks.reduce(
    (sum, kayak) => sum + Number(kayak.daily_rate_cents || 0),
    0
  );

  const stripeMode = getKayakStripeMode();
  const stripe = createStripeClient(stripeMode);
  const baseUrl = getAppBaseUrl(req);
  const successUrl = `${baseUrl}/book/confirmation/${primary.id}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelToken = createBookingCancelToken({
    bookingId: primary.id,
    referenceCode: primary.reference_code,
    kayakId: primary.kayak_id,
  });
  const cancelParams = new URLSearchParams({
    date: body.dateIso,
    reservation: body.reservationId.trim(),
    lastName: body.lastName.trim(),
    payment: "cancelled",
    token: cancelToken,
  });
  const cancelUrl = `${baseUrl}/book/cancel/${primary.id}?${cancelParams.toString()}`;
  const metadata = {
    kind: "kayak_booking",
    bookingId: primary.id,
    bookingIds: bookingIds.join(","),
    reservationId: reservation.id,
    kayakId: kayaks[0].id,
    kayakIds: kayaks.map((kayak) => kayak.id).join(","),
    referenceCode: primary.reference_code,
    referenceCodes: referenceCodes.join(","),
  };

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: primary.id,
        success_url: successUrl,
        cancel_url: cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        metadata,
        payment_intent_data: { metadata },
        line_items: kayaks.map((kayak) => ({
          quantity: 1,
          price_data: stripePriceData({
            kayak,
            amountCents: kayak.daily_rate_cents,
            cabin,
            dateIso: body.dateIso,
            stripeMode,
          }),
        })),
      },
      { idempotencyKey: `booking-checkout-${primary.id}` }
    );

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("id", primary.id);

    if (updateError || !session.url) {
      await stripe.checkout.sessions.expire(session.id).catch(() => {});
      await cancelInsertedBookings(
        supabase,
        bookingIds,
        updateError
          ? `Stripe checkout created but could not be saved: ${updateError.message}`
          : "Stripe checkout did not return a redirect URL."
      );

      return NextResponse.json(
        { error: updateError?.message ?? "Could not create checkout." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      bookingId: primary.id,
      bookingIds,
      referenceCode: primary.reference_code,
      referenceCodes,
      lockboxCode: null,
      lockboxCodes: kayaks.map((kayak) => ({
        kayakId: kayak.id,
        name: kayak.name,
        code: null,
      })),
      isComplimentary: false,
      amountCents,
      totalAmountCents: amountCents,
      cabin,
      customerName,
      guestName: reservation.guestName,
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
    });
  } catch (err) {
    await cancelInsertedBookings(
      supabase,
      bookingIds,
      `Stripe checkout failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );

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
