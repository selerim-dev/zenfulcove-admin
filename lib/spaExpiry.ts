import { listExpiredPendingBookings } from "@/lib/spaBookings";
import { expireBooking } from "@/lib/spaLifecycle";

/**
 * Expire (refund + notify) every pending_therapist booking whose 30-minute
 * window has elapsed. Driven by the spa-expiry cron, and called as a safety net
 * from the availability endpoint. Returns counts for logging.
 */
export async function sweepExpiredMassageBookings() {
  const expired = await listExpiredPendingBookings();
  let processed = 0;
  for (const booking of expired) {
    try {
      const result = await expireBooking(booking);
      if (result.outcome === "expired") processed += 1;
    } catch (err) {
      console.error(`Could not expire massage booking ${booking.id}:`, err);
    }
  }
  return { found: expired.length, processed };
}
