import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { getConfig } from "@/lib/kv";
import { getBookingById } from "@/lib/lodgify";
import {
  bookingHasLocalFormSubmission,
  listLocalFormSubmissions,
} from "@/lib/local-forms";
import { bookingHasWaiver, getFormSubmissions } from "@/lib/jotform";
import {
  sendAccessCodeForBooking,
  sendMissingFormEmailForBooking,
} from "@/lib/access-code-messages";
import { runAccessCodeRelease } from "@/app/api/cron/route";

function clean(value) {
  return String(value || "").trim();
}

function mergeConfig(base, body = {}) {
  return {
    ...base,
    waiverReminders: body.waiverReminders
      ? { ...base.waiverReminders, ...body.waiverReminders }
      : base.waiverReminders,
    accessCodeRelease: {
      ...base.accessCodeRelease,
      ...(body.accessCodeRelease || {}),
      enabled: true,
    },
  };
}

async function formIsCompleteForBooking(automationConfig, bookingId) {
  const releaseConfig = automationConfig.accessCodeRelease || {};
  const waiverConfig = automationConfig.waiverReminders || {};
  const localFormSlug = clean(
    releaseConfig.localFormSlug || waiverConfig.localFormSlug || waiverConfig.formSlug
  ).replace(/^\/?forms\//, "");
  const jotformFormId =
    releaseConfig.jotformFormId ||
    waiverConfig.jotformFormId ||
    waiverConfig.reminders?.[0]?.jotformFormId;

  if (localFormSlug) {
    const submissions = await listLocalFormSubmissions({
      formSlugs: [localFormSlug],
      limit: 10000,
    });
    return bookingHasLocalFormSubmission(bookingId, submissions);
  }

  if (jotformFormId) {
    const submissions = await getFormSubmissions(jotformFormId);
    return bookingHasWaiver(bookingId, submissions);
  }

  return false;
}

export async function POST(request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const dryRun = body?.dryRun !== false;
    const bookingId = clean(body?.bookingId);
    const baseConfig = await getConfig();
    const automationConfig = mergeConfig(baseConfig, body);

    if (!bookingId) {
      if (!dryRun) {
        return NextResponse.json(
          { error: "A Lodgify booking ID is required for a live Lodgify test." },
          { status: 400 }
        );
      }

      const logs = await runAccessCodeRelease(automationConfig, true, {
        bypassReleaseTime: true,
        maxBookings: 20,
        persistState: false,
      });
      const hasFailed = logs.some((log) => log.status === "failed");
      return NextResponse.json({
        status: hasFailed ? "FAILED" : "SUCCESS",
        timestamp: new Date().toISOString(),
        logs,
      });
    }

    const booking = await getBookingById(bookingId);
    if (!booking) {
      return NextResponse.json(
        { error: `Lodgify booking ${bookingId} was not found.` },
        { status: 404 }
      );
    }

    const hasForm = await formIsCompleteForBooking(automationConfig, bookingId);
    const messagePrefix = dryRun
      ? ""
      : "[TEST ONLY - Zenfulcove internal access-code flow]\n\n";
    const sendResult = hasForm
      ? await sendAccessCodeForBooking({
          booking,
          automationConfig,
          dryRun,
          persistState: false,
          messagePrefix,
        })
      : await sendMissingFormEmailForBooking({
          booking,
          automationConfig,
          dryRun,
          persistState: false,
          messagePrefix,
        });

    const logs = [
      {
        timestamp: new Date().toISOString(),
        automation: "Access Code Release Test",
        property: booking.property_name || booking.propertyName || "—",
        action: hasForm
          ? `Booking ${bookingId} has the selected form; testing access-code Lodgify message.`
          : `Booking ${bookingId} is missing the selected form; testing missing-form Lodgify message.`,
        status: "info",
      },
      {
        timestamp: sendResult.timestamp || new Date().toISOString(),
        automation: "Access Code Release Test",
        property: booking.property_name || booking.propertyName || "—",
        action: sendResult.action,
        status: sendResult.status,
      },
    ];

    const hasFailed = logs.some((log) => log.status === "failed");
    return NextResponse.json({
      status: hasFailed ? "FAILED" : "SUCCESS",
      timestamp: new Date().toISOString(),
      logs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Access code release test failed." },
      { status: 500 }
    );
  }
}
