import { TWILIO_FROM_NUMBER } from "@/config/keys";
import { PROPERTY_TIMEZONE } from "@/lib/dates";
import { sendBookingMessage } from "@/lib/lodgify";
import { getAppBaseUrl } from "@/lib/stripe";
import { sendSms } from "@/lib/twilio";
import { createSpaActionToken } from "@/lib/spaActionToken";
import { formatMoney, type MassageBooking, type MassageTherapist } from "@/lib/types";

const sendLodgifyBookingMessage = sendBookingMessage as (
  bookingId: string,
  options: {
    subject: string;
    message: string;
    type?: string;
    sendNotification?: boolean;
  }
) => Promise<unknown>;

function firstNameOf(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "there";
}

function dateTimeLabel(startsAtIso: string) {
  return new Date(startsAtIso).toLocaleString("en-US", {
    timeZone: PROPERTY_TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** SMS Beth the request + one-tap Accept / Decline links. Returns send state. */
export async function notifyTherapistOfRequest(
  booking: MassageBooking,
  therapist: MassageTherapist
) {
  const phone = String(therapist.phone || "").trim();
  if (!phone) return { sent: false, reason: "therapist has no phone" };

  const baseUrl = getAppBaseUrl();
  const acceptUrl = `${baseUrl}/api/spa/respond?b=${booking.id}&a=accept&token=${createSpaActionToken(
    booking.id,
    "accept"
  )}`;
  const declineUrl = `${baseUrl}/api/spa/respond?b=${booking.id}&a=decline&token=${createSpaActionToken(
    booking.id,
    "decline"
  )}`;

  const body = [
    "New Zenfulcove massage request:",
    `${booking.service_label} for ${firstNameOf(booking.customer_name)}${
      booking.stay_location ? ` (${booking.stay_location})` : ""
    }`,
    dateTimeLabel(booking.starts_at),
    `Guest pays ${formatMoney(booking.amount_cents)} · you receive ${formatMoney(
      booking.payout_cents
    )}.`,
    "",
    "Respond within 30 minutes:",
    `Accept: ${acceptUrl}`,
    `Decline: ${declineUrl}`,
  ].join("\n");

  await sendSms({ to: phone, body, from: TWILIO_FROM_NUMBER });
  return { sent: true };
}

async function postGuestMessage(
  booking: MassageBooking,
  subject: string,
  message: string
) {
  if (!booking.lodgify_reservation_id) {
    return { sent: false, reason: "missing Lodgify reservation id" };
  }
  await sendLodgifyBookingMessage(booking.lodgify_reservation_id, {
    subject,
    message,
    type: "Owner",
    sendNotification: true,
  });
  return { sent: true };
}

export async function notifyGuestRequestReceived(booking: MassageBooking) {
  const message = [
    `Hi ${firstNameOf(booking.customer_name)},`,
    "",
    `We received your request for a ${booking.service_label} on ${dateTimeLabel(
      booking.starts_at
    )}.`,
    "",
    "Your therapist will confirm shortly (usually within 30 minutes). We'll message you as soon as it's confirmed. If the time isn't available, your payment is refunded automatically and you can pick another time.",
  ].join("\n");
  return postGuestMessage(booking, "Massage request received", message);
}

export async function notifyGuestConfirmed(booking: MassageBooking) {
  const message = [
    `Hi ${firstNameOf(booking.customer_name)},`,
    "",
    `Your ${booking.service_label} is confirmed for ${dateTimeLabel(
      booking.starts_at
    )}.`,
    "",
    "Your therapist will arrive at your cabin at the scheduled time. See you soon!",
  ].join("\n");
  return postGuestMessage(booking, "In-cabin massage confirmed", message);
}

export async function notifyGuestUnavailable(
  booking: MassageBooking,
  { refunded }: { refunded: boolean } = { refunded: true }
) {
  const baseUrl = getAppBaseUrl();
  const message = [
    `Hi ${firstNameOf(booking.customer_name)},`,
    "",
    `Unfortunately your requested time for the ${booking.service_label} on ${dateTimeLabel(
      booking.starts_at
    )} isn't available.`,
    refunded ? "Your payment has been fully refunded." : "",
    "",
    `Please choose another time here: ${baseUrl}/spa`,
  ]
    .filter(Boolean)
    .join("\n");
  return postGuestMessage(booking, "Massage time unavailable", message);
}
