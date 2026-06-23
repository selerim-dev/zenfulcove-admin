import { getFreeBusy, insertCalendarEvent } from "@/lib/google-calendar";
import {
  notifyGuestConfirmed,
  notifyGuestUnavailable,
} from "@/lib/spaMessages";
import { refundMassagePayment } from "@/lib/spaPayments";
import { updateMassageBooking } from "@/lib/spaBookings";
import type { MassageBooking, MassageTherapist } from "@/lib/types";

const MIN = 60_000;

export type LifecycleOutcome =
  | { outcome: "confirmed" }
  | { outcome: "declined"; refunded: boolean }
  | { outcome: "expired"; refunded: boolean }
  | { outcome: "noop" };

function appointmentEndIso(booking: MassageBooking) {
  // Calendar event covers the appointment itself (buffer is internal padding).
  return new Date(
    new Date(booking.starts_at).getTime() + booking.duration_min * MIN
  ).toISOString();
}

/**
 * Refund (if there's a captured payment) and move the booking out of the live
 * state, then tell the guest the time is unavailable. Shared by therapist
 * decline, accept-time conflicts, and the expiry cron.
 */
async function releaseAndNotify(
  booking: MassageBooking,
  status: "declined" | "expired",
  reason: string
): Promise<LifecycleOutcome> {
  let refundId = booking.refund_id;
  if (booking.stripe_payment_intent_id && !booking.refund_id) {
    try {
      refundId = await refundMassagePayment(booking.stripe_payment_intent_id);
    } catch (err) {
      console.error(`Could not refund massage ${booking.id}:`, err);
    }
  }

  const updated = await updateMassageBooking(
    booking.id,
    {
      status,
      refund_id: refundId,
      notes: [booking.notes, reason].filter(Boolean).join("\n"),
    },
    "pending_therapist"
  );
  if (!updated) return { outcome: "noop" };

  await notifyGuestUnavailable(updated, {
    refunded: Boolean(refundId),
  }).catch((err) => console.error(`Could not message guest ${booking.id}:`, err));

  return { outcome: status, refunded: Boolean(refundId) };
}

export async function declineBooking(
  booking: MassageBooking,
  reason = "Declined by therapist."
): Promise<LifecycleOutcome> {
  return releaseAndNotify(booking, "declined", reason);
}

export async function expireBooking(
  booking: MassageBooking
): Promise<LifecycleOutcome> {
  return releaseAndNotify(
    booking,
    "expired",
    "Expired — no therapist response within 30 minutes."
  );
}

/**
 * Confirm a pending request: re-check the therapist's external calendar, flip to
 * confirmed, write the event to her calendar (best effort), and confirm the
 * guest. If the calendar now shows a conflict, decline + refund instead.
 */
export async function acceptBooking(
  booking: MassageBooking,
  therapist: MassageTherapist | null
): Promise<LifecycleOutcome> {
  const calendarId = therapist?.google_calendar_id || "";

  if (calendarId) {
    try {
      const busy = await getFreeBusy(
        calendarId,
        booking.starts_at,
        booking.ends_at
      );
      const start = new Date(booking.starts_at);
      const end = new Date(booking.ends_at);
      const conflict = busy.some((b) => start < b.end && b.start < end);
      if (conflict) {
        return releaseAndNotify(
          booking,
          "declined",
          "Therapist calendar conflict found when accepting; auto-refunded."
        );
      }
    } catch (err) {
      // Don't block an accept on a transient Google error — proceed.
      console.error(`Free/busy re-check failed for ${booking.id}:`, err);
    }
  }

  const updated = await updateMassageBooking(
    booking.id,
    { status: "confirmed" },
    "pending_therapist"
  );
  if (!updated) return { outcome: "noop" };

  if (calendarId) {
    try {
      const eventId = await insertCalendarEvent(calendarId, {
        summary: `Massage — ${updated.customer_name}${
          updated.stay_location ? ` (${updated.stay_location})` : ""
        }`,
        description: `${updated.service_label}\nZenfulcove in-cabin massage`,
        startIso: updated.starts_at,
        endIso: appointmentEndIso(updated),
        timeZone: therapist?.timezone || "America/Chicago",
      });
      if (eventId) {
        await updateMassageBooking(updated.id, { google_event_id: eventId });
      }
    } catch (err) {
      console.error(`Could not add calendar event for ${updated.id}:`, err);
    }
  }

  await notifyGuestConfirmed(updated).catch((err) =>
    console.error(`Could not confirm guest ${updated.id}:`, err)
  );

  return { outcome: "confirmed" };
}
