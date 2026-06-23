import { NextResponse } from "next/server";
import { CRON_SECRET } from "@/config/keys";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";
import { sweepExpiredMassageBookings } from "@/lib/spaExpiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Runs frequently (see vercel.json) to honor the 30-minute therapist response
// window: any pending request past its deadline is refunded and the guest is
// asked to rebook.
export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ ok: true, skipped: "supabase not configured" });
  }

  try {
    const result = await sweepExpiredMassageBookings();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("spa-expiry cron failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
