import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import {
  fetchTwilioInboundsForNumber,
  fetchTwilioOutboundToContact,
  getConfiguredTwilioNumbers,
  normalizePhone,
} from "@/lib/twilio";
import { appendSmsMessage } from "@/lib/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function classifyDirection(rawDirection) {
  return String(rawDirection || "").toLowerCase().startsWith("outbound") ? "out" : "in";
}

function messageTimestamp(msg) {
  if (msg?.date_sent) return new Date(msg.date_sent).getTime();
  if (msg?.date_created) return new Date(msg.date_created).getTime();
  return Date.now();
}

export async function POST(request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => ({}));
    const sinceMs = Number(body?.sinceMs) || Date.now() - ONE_YEAR_MS;
    const requestedNumber = body?.twilioNumber ? normalizePhone(body.twilioNumber) : "";

    const enabledNumbers = getConfiguredTwilioNumbers().filter((n) => n.enabled && n.number);
    const targets = requestedNumber
      ? enabledNumbers.filter((n) => normalizePhone(n.number) === requestedNumber)
      : enabledNumbers;

    if (targets.length === 0) {
      return NextResponse.json(
        { error: "No enabled Twilio numbers to sync." },
        { status: 400 }
      );
    }

    const summary = [];

    for (const target of targets) {
      const twilioNumber = normalizePhone(target.number);

      // 1. Pull every inbound message in the window. These define which
      //    threads exist (only conversations with at least one reply).
      const inbounds = await fetchTwilioInboundsForNumber({ twilioNumber, sinceMs });

      // Group inbounds by contact phone.
      const inboundsByContact = new Map();
      for (const msg of inbounds) {
        const contactPhone = normalizePhone(msg.from);
        if (!contactPhone) continue;
        if (!inboundsByContact.has(contactPhone)) inboundsByContact.set(contactPhone, []);
        inboundsByContact.get(contactPhone).push(msg);
      }

      let importedInbound = 0;
      let importedOutbound = 0;
      const seenSids = new Set();

      // 2. For each contact who replied, write inbounds + fetch their outbounds.
      for (const [contactPhone, contactInbounds] of inboundsByContact.entries()) {
        for (const msg of contactInbounds) {
          if (!msg?.sid || seenSids.has(msg.sid)) continue;
          seenSids.add(msg.sid);

          await appendSmsMessage({
            twilioNumber,
            contactPhone,
            message: {
              id: msg.sid,
              direction: "in",
              body: msg.body || "",
              twilioNumber,
              contactPhone,
              timestamp: messageTimestamp(msg),
              sid: msg.sid,
              status: msg.status || "received",
            },
            suppressUnread: true,
          });
          importedInbound += 1;
        }

        const outbounds = await fetchTwilioOutboundToContact({
          twilioNumber,
          contactPhone,
          sinceMs,
        });

        for (const msg of outbounds) {
          if (!msg?.sid || seenSids.has(msg.sid)) continue;
          seenSids.add(msg.sid);

          await appendSmsMessage({
            twilioNumber,
            contactPhone,
            message: {
              id: msg.sid,
              direction: classifyDirection(msg.direction),
              body: msg.body || "",
              twilioNumber,
              contactPhone,
              timestamp: messageTimestamp(msg),
              sid: msg.sid,
              status: msg.status || "sent",
            },
            suppressUnread: true,
          });
          importedOutbound += 1;
        }
      }

      summary.push({
        twilioNumber,
        label: target.label,
        threads: inboundsByContact.size,
        importedInbound,
        importedOutbound,
      });
    }

    return NextResponse.json({ success: true, summary });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Backfill failed." },
      { status: 500 }
    );
  }
}
