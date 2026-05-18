import { NextResponse } from "next/server";
import {
  extractAccessCodeWebhookPayload,
  upsertAccessCodeRelease,
} from "@/lib/access-code-releases";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";

function authorized(request) {
  const secret = String(process.env.JERVIS_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Jervis webhook secret is not configured." },
        { status: 503 }
      ),
    };
  }

  const auth = request.headers.get("authorization") || "";
  const headerSecret = request.headers.get("x-jervis-secret") || "";
  if (auth === `Bearer ${secret}` || headerSecret === secret) {
    return { ok: true };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

export async function POST(request) {
  const auth = authorized(request);
  if (!auth.ok) return auth.response;

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Supabase is not configured for access code storage." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = extractAccessCodeWebhookPayload(body);
  if (!payload.bookingId || !payload.accessCode) {
    return NextResponse.json(
      {
        error:
          "Missing booking/reservation ID or access code. Send bookingId/reservationId plus accessCode/code.",
      },
      { status: 400 }
    );
  }

  try {
    const row = await upsertAccessCodeRelease(payload);
    return NextResponse.json({
      ok: true,
      bookingId: row.booking_id,
      status: row.status,
      source: row.source,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not store access code.",
      },
      { status: 500 }
    );
  }
}
