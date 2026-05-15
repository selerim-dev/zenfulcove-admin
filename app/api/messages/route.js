import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import {
  listSmsThreads,
  listSmsMessages,
  markSmsThreadRead,
} from "@/lib/kv";
import { getConfiguredTwilioNumbers, normalizePhone } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const twilioNumberRaw = searchParams.get("twilioNumber") || "";
  const contactPhoneRaw = searchParams.get("contactPhone") || "";

  const numbers = getConfiguredTwilioNumbers();
  const twilioNumber = normalizePhone(twilioNumberRaw);

  if (twilioNumber && contactPhoneRaw) {
    const contactPhone = normalizePhone(contactPhoneRaw);
    const messages = await listSmsMessages({ twilioNumber, contactPhone });
    await markSmsThreadRead({ twilioNumber, contactPhone });
    return NextResponse.json({ numbers, messages });
  }

  if (twilioNumber) {
    const threads = await listSmsThreads(twilioNumber);
    return NextResponse.json({ numbers, threads });
  }

  // No filter: return all threads across all configured numbers.
  const enabledNumbers = numbers.filter((n) => n.enabled && n.number);
  const allThreads = (
    await Promise.all(
      enabledNumbers.map((n) => listSmsThreads(normalizePhone(n.number)))
    )
  ).flat();
  allThreads.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  return NextResponse.json({ numbers, threads: allThreads });
}
