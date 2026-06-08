import { NextResponse } from "next/server";
import { getConfig, setConfig } from "@/lib/kv";
import {
  authenticateEventCode,
  buildEventPortalPayload,
  participantCodeConflict,
  updateEventInConfig,
} from "@/lib/eventPortal";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  let body: { facilitatorCode?: string; code?: string; updates?: Record<string, unknown> };

  try {
    body = (await request.json()) as {
      facilitatorCode?: string;
      code?: string;
      updates?: Record<string, unknown>;
    };
  } catch {
    return jsonResponse({ error: "Invalid request." }, { status: 400 });
  }

  const config = await getConfig();
  const auth = authenticateEventCode(
    config.eventPortal || {},
    body.facilitatorCode || body.code
  );

  if (!auth || auth.role !== "facilitator" || auth.event.id !== eventId) {
    return jsonResponse(
      { error: "Facilitator access is required to update this event." },
      { status: 403 }
    );
  }

  if (body.updates?.participantCode !== undefined) {
    const conflict = participantCodeConflict({
      config: config.eventPortal || {},
      eventId,
      code: body.updates.participantCode,
    });
    if (conflict) {
      return jsonResponse({ error: conflict }, { status: 409 });
    }
  }

  const result = updateEventInConfig({
    currentConfig: config,
    eventId,
    updates: body.updates || {},
  });

  if (!result) {
    return jsonResponse({ error: "Event not found." }, { status: 404 });
  }

  await setConfig(result.nextConfig);

  const payload = await buildEventPortalPayload({
    config: result.nextConfig,
    event: result.event,
    role: "facilitator",
  });
  return jsonResponse(payload);
}
