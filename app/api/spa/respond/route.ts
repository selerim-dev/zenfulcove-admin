import { getMassageBooking, getTherapist } from "@/lib/spaBookings";
import { acceptBooking, declineBooking, expireBooking } from "@/lib/spaLifecycle";
import { verifySpaActionToken, type SpaAction } from "@/lib/spaActionToken";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { MASSAGE_STATUS_LABELS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Tone = "success" | "error" | "neutral";

function page(title: string, message: string, tone: Tone = "neutral") {
  const accent =
    tone === "success" ? "#16a34a" : tone === "error" ? "#dc2626" : "#0f766e";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · Zenfulcove</title>
<style>
  body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#f5f4f1; color:#1c1c1c; }
  .wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
  .card { background:#fff; border:1px solid #e6e3dd; border-radius:20px; padding:32px; max-width:440px; width:100%; box-shadow:0 10px 30px rgba(0,0,0,0.05); text-align:center; }
  .eyebrow { font-size:11px; letter-spacing:0.22em; text-transform:uppercase; color:#9a958c; }
  h1 { font-size:24px; margin:14px 0 10px; color:${accent}; }
  p { font-size:15px; line-height:1.6; color:#555; margin:0; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="eyebrow">Zenfulcove Glamping</div>
      <h1>${title}</h1>
      <p>${message}</p>
    </div>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bookingId = String(url.searchParams.get("b") || "").trim();
  const action = String(url.searchParams.get("a") || "").trim() as SpaAction;
  const token = String(url.searchParams.get("token") || "").trim();

  if (action !== "accept" && action !== "decline") {
    return page("Invalid link", "This link isn't valid.", "error");
  }
  if (!hasSupabaseAdminEnv()) {
    return page(
      "Temporarily unavailable",
      "We couldn't process this right now. Please try again shortly.",
      "error"
    );
  }
  if (!verifySpaActionToken(bookingId, action, token)) {
    return page(
      "Invalid or expired link",
      "This link isn't valid. Please use the most recent text message.",
      "error"
    );
  }

  const booking = await getMassageBooking(bookingId);
  if (!booking) {
    return page("Not found", "We couldn't find that booking request.", "error");
  }

  if (booking.status !== "pending_therapist") {
    return page(
      "Already handled",
      `This request is already marked “${MASSAGE_STATUS_LABELS[booking.status]}”. No further action is needed.`
    );
  }

  if (
    booking.therapist_deadline &&
    new Date(booking.therapist_deadline).getTime() < Date.now()
  ) {
    await expireBooking(booking).catch((err) => console.error(err));
    return page(
      "Request expired",
      "This request passed its 20-minute window. The guest has been refunded and asked to choose another time.",
      "error"
    );
  }

  const therapist = await getTherapist(booking.therapist_id);

  if (action === "accept") {
    const result = await acceptBooking(booking, therapist);
    if (result.outcome === "confirmed") {
      return page(
        "Booking accepted ✓",
        "Thank you! The appointment has been added to your calendar and the guest is confirmed.",
        "success"
      );
    }
    if (result.outcome === "declined") {
      return page(
        "Time no longer available",
        "Your calendar shows a conflict at that time, so we declined the request and refunded the guest.",
        "error"
      );
    }
    return page("Already handled", "This request was already handled.");
  }

  const result = await declineBooking(booking);
  if (result.outcome === "declined") {
    return page(
      "Booking declined",
      "Thanks for letting us know. The guest has been refunded and asked to choose another time.",
      "error"
    );
  }
  return page("Already handled", "This request was already handled.");
}
