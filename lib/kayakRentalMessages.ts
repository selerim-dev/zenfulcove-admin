import type { SupabaseClient } from "@supabase/supabase-js";
import { PROPERTY_TIMEZONE } from "@/lib/dates";
import { colorLabel, formatMoney, type Kayak } from "@/lib/types";
import { sendBookingMessage } from "@/lib/lodgify";

const MESSAGE_SENT_MARKER = "Kayak rental message sent";
const sendLodgifyBookingMessage = sendBookingMessage as (
  bookingId: string,
  options: {
    subject: string;
    message: string;
    type?: string;
    sendNotification?: boolean;
  }
) => Promise<unknown>;

type BookingForMessage = {
  id: string;
  reference_code: string | null;
  kayak_id: string;
  customer_name: string | null;
  stay_location: string | null;
  lodgify_reservation_id: string | null;
  starts_at: string;
  ends_at: string;
  amount_cents: number;
  status: string;
  notes: string | null;
};

type KayakForMessage = Pick<
  Kayak,
  "id" | "name" | "code" | "capacity" | "length_feet" | "color"
>;

export function bookingIdsFromStripeMetadata(
  metadata: Record<string, string> | null | undefined,
  fallbackId?: string | null
) {
  const ids = String(metadata?.bookingIds || metadata?.bookingId || fallbackId || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

function firstNameOf(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "";
}

function rentalDateLabel(startsAt: string) {
  return new Date(startsAt).toLocaleDateString("en-US", {
    timeZone: PROPERTY_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function describeKayak(kayak: KayakForMessage) {
  const details = [colorLabel(kayak.color)];
  if (kayak.length_feet) details.push(`${kayak.length_feet} ft`);
  details.push(
    `${kayak.capacity} ${kayak.capacity === 1 ? "paddler" : "paddlers"}`
  );
  return `${kayak.name} (${details.join(", ")})`;
}

function buildMessage(
  bookings: BookingForMessage[],
  kayaksById: Map<string, KayakForMessage>
) {
  const first = bookings[0];
  const greetingName = firstNameOf(first.customer_name);
  const dateLabel = rentalDateLabel(first.starts_at);
  const total = bookings.reduce(
    (sum, booking) => sum + Number(booking.amount_cents || 0),
    0
  );
  const lines = bookings.map((booking) => {
    const kayak = kayaksById.get(booking.kayak_id);
    const name = kayak ? describeKayak(kayak) : "Kayak rental";
    const code = kayak?.code || "Code pending";
    return `- ${name}: lock code ${code}`;
  });

  return [
    greetingName ? `Hi ${greetingName},` : "Hi,",
    "",
    `Your paid kayak rental is confirmed for ${dateLabel}.`,
    "",
    "Rental kayak codes:",
    ...lines,
    "",
    `Total paid: ${formatMoney(total)}.`,
    "",
    "Please use only the rental kayaks listed above for this paid rental and return them by 5:00 PM.",
  ].join("\n");
}

async function markMessageSent(
  supabase: SupabaseClient,
  bookings: BookingForMessage[]
) {
  const timestamp = new Date().toISOString();

  await Promise.all(
    bookings.map((booking) => {
      const existing = String(booking.notes || "").trim();
      const notes = existing
        ? `${existing}\n${MESSAGE_SENT_MARKER}: ${timestamp}`
        : `${MESSAGE_SENT_MARKER}: ${timestamp}`;

      return supabase.from("bookings").update({ notes }).eq("id", booking.id);
    })
  );
}

export async function sendKayakRentalConfirmationMessage(
  supabase: SupabaseClient,
  bookingIds: string[]
) {
  const uniqueBookingIds = Array.from(new Set(bookingIds.filter(Boolean)));
  if (uniqueBookingIds.length === 0) {
    return { sent: false, reason: "missing booking ids" };
  }

  const { data: bookings, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, reference_code, kayak_id, customer_name, stay_location, lodgify_reservation_id, starts_at, ends_at, amount_cents, status, notes"
    )
    .in("id", uniqueBookingIds);

  if (bookingError) throw new Error(bookingError.message);

  const orderedBookings = uniqueBookingIds
    .map((id) => (bookings as BookingForMessage[] | null)?.find((b) => b.id === id))
    .filter((booking): booking is BookingForMessage => {
      if (!booking) return false;
      return booking.status === "confirmed" && Number(booking.amount_cents) > 0;
    });

  if (orderedBookings.length === 0) {
    return { sent: false, reason: "no confirmed paid bookings" };
  }

  if (
    orderedBookings.some((booking) =>
      String(booking.notes || "").includes(MESSAGE_SENT_MARKER)
    )
  ) {
    return { sent: false, reason: "already sent" };
  }

  const lodgifyReservationId = orderedBookings[0].lodgify_reservation_id;
  if (!lodgifyReservationId) {
    return { sent: false, reason: "missing Lodgify reservation id" };
  }

  const kayakIds = orderedBookings.map((booking) => booking.kayak_id);
  const { data: kayaks, error: kayakError } = await supabase
    .from("kayaks")
    .select("id, name, code, capacity, length_feet, color")
    .in("id", kayakIds);

  if (kayakError) throw new Error(kayakError.message);

  const kayaksById = new Map(
    ((kayaks as KayakForMessage[] | null) || []).map((kayak) => [kayak.id, kayak])
  );
  const message = buildMessage(orderedBookings, kayaksById);

  await sendLodgifyBookingMessage(lodgifyReservationId, {
    subject: "Kayak rental confirmed",
    message,
    type: "Owner",
    sendNotification: true,
  });

  await markMessageSent(supabase, orderedBookings);

  return { sent: true, bookingIds: orderedBookings.map((booking) => booking.id) };
}
