import { NextResponse } from "next/server";
import { getConfig } from "@/lib/kv";
import {
  authenticateEventCode,
  buildEventPortalPayload,
} from "@/lib/eventPortal";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return jsonResponse({ error: "Invalid request." }, { status: 400 });
  }

  const config = await getConfig();
  const auth = authenticateEventCode(config.eventPortal || {}, body.code);
  if (!auth) {
    return jsonResponse(
      { error: "That event code was not recognized." },
      { status: 401 }
    );
  }

  const payload = await buildEventPortalPayload({
    config,
    event: auth.event,
    role: auth.role,
  });
  return jsonResponse(payload);
}
