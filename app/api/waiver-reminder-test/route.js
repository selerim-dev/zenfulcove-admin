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
  ineligibleBookingStatusMessage,
  isBookedLodgifyStatus,
  lodgifyBookingStatus,
  lodgifyPropertyName,
  sendWaiverReminderForBooking,
  toDateOnly,
  todayCentral,
  waiverReminderFormSource,
} from "@/lib/access-code-messages";
import { runWaiverReminders } from "@/app/api/cron/route";

function clean(value) {
  return String(value || "").trim();
}

function mergeConfig(base, body = {}) {
  return {
    ...base,
    waiverReminders: body.waiverReminders
      ? { ...base.waiverReminders, ...body.waiverReminders }
      : base.waiverReminders,
    accessCodeRelease: body.accessCodeRelease
      ? { ...base.accessCodeRelease, ...body.accessCodeRelease }
      : base.accessCodeRelease,
  };
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function daysBetween(fromDate, toDate) {
  const from = new Date(`${fromDate}T12:00:00Z`);
  const to = new Date(`${toDate}T12:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function dateDaysFromNow(days) {
  return addDays(todayCentral(), days);
}

function sampleBookingFor({
  id,
  status = "Booked",
  propertyId = "608954",
  propertyName = "Sky Castle",
  arrivalDays = 1,
  departureDays = 3,
} = {}) {
  return {
    id,
    status,
    property_id: propertyId,
    property_name: propertyName,
    arrival: dateDaysFromNow(arrivalDays),
    departure: dateDaysFromNow(departureDays),
    guest: {
      firstName: "Sample",
      lastName: "Guest",
      name: "Sample Guest",
      email: "sample.guest@example.com",
      phone: "+15551234567",
    },
  };
}

function remindersForConfig(automationConfig) {
  const reminders =
    automationConfig.waiverReminders?.emails ||
    automationConfig.waiverReminders?.reminders ||
    [];
  return reminders.length
    ? reminders
    : [
        {
          daysBeforeCheckin: 1,
          label: "Reminder",
          subjectTemplate: "Reservation form needed for {{propertyDisplayName}}",
          messageTemplate: "",
        },
      ];
}

function reminderForBooking(automationConfig, booking) {
  const reminders = remindersForConfig(automationConfig);
  const arrival = toDateOnly(
    booking?.arrival ||
      booking?.start_date ||
      booking?.checkIn ||
      booking?.checkin_date
  );
  const daysUntilCheckin = daysBetween(todayCentral(), arrival);
  return (
    reminders.find(
      (reminder) => Number(reminder?.daysBeforeCheckin) === daysUntilCheckin
    ) ||
    reminders.find((reminder) => Number(reminder?.daysBeforeCheckin) === 1) ||
    reminders[0]
  );
}

function resultLog(sendResult, property, automation = "Waiver Reminder Test") {
  return {
    timestamp: sendResult.timestamp || new Date().toISOString(),
    automation,
    property,
    action: sendResult.action,
    status: sendResult.status,
    ...(sendResult.decision ? { decision: sendResult.decision } : {}),
    ...(sendResult.deliveryChannel ? { deliveryChannel: sendResult.deliveryChannel } : {}),
    ...(sendResult.templateId ? { templateId: sendResult.templateId } : {}),
    ...(sendResult.bookingId ? { bookingId: sendResult.bookingId } : {}),
    ...(sendResult.templateData ? { templateData: sendResult.templateData } : {}),
  };
}

async function formIsCompleteForBooking(automationConfig, bookingId) {
  const waiverConfig = automationConfig.waiverReminders || {};
  const releaseConfig = automationConfig.accessCodeRelease || {};
  const localFormSlug = clean(
    waiverConfig.localFormSlug ||
      releaseConfig.localFormSlug ||
      waiverConfig.formSlug ||
      "welcome-to-zenfulcove"
  ).replace(/^\/?forms\//, "");
  const jotformFormId =
    waiverConfig.jotformFormId ||
    releaseConfig.jotformFormId ||
    waiverConfig.emails?.[0]?.jotformFormId ||
    waiverConfig.reminders?.[0]?.jotformFormId;
  const usesLocalForm = waiverReminderFormSource(waiverConfig) === "internal";

  if (usesLocalForm && localFormSlug) {
    const submissions = await listLocalFormSubmissions({
      formSlugs: [localFormSlug],
      limit: 10000,
    });
    return bookingHasLocalFormSubmission(bookingId, submissions);
  }

  if (!usesLocalForm && jotformFormId) {
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
    const sample = Boolean(body?.sample);
    const bookingId = clean(body?.bookingId);
    const baseConfig = await getConfig();
    const automationConfig = mergeConfig(baseConfig, body);
    const formSource = waiverReminderFormSource(
      automationConfig.waiverReminders || {}
    );

    if (sample) {
      const samplePropertyName = clean(body?.samplePropertyName) || "Sky Castle";
      const samplePropertyId = clean(body?.samplePropertyId) || "608954";
      const reminder = reminderForBooking(
        automationConfig,
        sampleBookingFor({ propertyId: samplePropertyId, propertyName: samplePropertyName })
      );
      const missingFormBooking = sampleBookingFor({
        id: "sample-booked-form-missing",
        propertyId: samplePropertyId,
        propertyName: samplePropertyName,
      });
      const completedFormBooking = sampleBookingFor({
        id: "sample-booked-form-submitted",
        propertyId: samplePropertyId,
        propertyName: samplePropertyName,
      });
      const openBooking = sampleBookingFor({
        id: "sample-open-not-eligible",
        status: "Open",
        propertyId: samplePropertyId,
        propertyName: samplePropertyName,
      });
      const cancelledBooking = sampleBookingFor({
        id: "sample-cancelled-not-eligible",
        status: "Cancelled",
        propertyId: samplePropertyId,
        propertyName: samplePropertyName,
      });

      const missingFormResult = await sendWaiverReminderForBooking({
        booking: missingFormBooking,
        automationConfig,
        reminder,
        dryRun: true,
        persistState: false,
      });
      const openResult = await sendWaiverReminderForBooking({
        booking: openBooking,
        automationConfig,
        reminder,
        dryRun: true,
        persistState: false,
      });
      const cancelledResult = await sendWaiverReminderForBooking({
        booking: cancelledBooking,
        automationConfig,
        reminder,
        dryRun: true,
        persistState: false,
      });

      const logs = [
        {
          timestamp: new Date().toISOString(),
          automation: "Waiver Reminder Test",
          property: samplePropertyName,
          action: `Rendered fake waiver reminder flow without sending. Reminders use ${formSource === "internal" ? "Lodgify internal form links" : "legacy SendGrid/Jotform links"}.`,
          status: "info",
        },
        resultLog(missingFormResult, samplePropertyName),
        {
          timestamp: new Date().toISOString(),
          automation: "Waiver Reminder Test",
          property: samplePropertyName,
          action: `[DRY RUN] SKIP booking ${completedFormBooking.id} | selected form already submitted`,
          status: "skipped",
          bookingId: completedFormBooking.id,
          decision: "waiver-reminder",
        },
        resultLog(openResult, samplePropertyName),
        resultLog(cancelledResult, samplePropertyName),
      ];
      const hasFailed = logs.some((log) => log.status === "failed");
      return NextResponse.json({
        status: hasFailed ? "FAILED" : "SUCCESS",
        timestamp: new Date().toISOString(),
        logs,
      });
    }

    if (!bookingId) {
      if (!dryRun) {
        return NextResponse.json(
          { error: "A Lodgify booking ID is required for a live reminder test." },
          { status: 400 }
        );
      }

      const logs = await runWaiverReminders(automationConfig, true);
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

    const propertyName = lodgifyPropertyName(booking) || "Property";
    const bookingStatus = lodgifyBookingStatus(booking);
    if (!isBookedLodgifyStatus(bookingStatus)) {
      const log = {
        timestamp: new Date().toISOString(),
        automation: "Waiver Reminder Test",
        property: propertyName,
        action: ineligibleBookingStatusMessage(bookingId, bookingStatus),
        status: "skipped",
        bookingId,
        bookingStatus: bookingStatus || "unknown",
      };
      return NextResponse.json({
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
        logs: [log],
      });
    }

    const hasForm = await formIsCompleteForBooking(automationConfig, bookingId);
    if (hasForm) {
      return NextResponse.json({
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
        logs: [
          {
            timestamp: new Date().toISOString(),
            automation: "Waiver Reminder Test",
            property: propertyName,
            action: `Skipped booking ${bookingId}: selected form is already submitted`,
            status: "skipped",
            bookingId,
            decision: "waiver-reminder",
          },
        ],
      });
    }

    const reminder = reminderForBooking(automationConfig, booking);
    const messagePrefix = dryRun
      ? ""
      : "[TEST ONLY - Zenfulcove Glamping waiver reminder]\n\n";
    const sendResult = await sendWaiverReminderForBooking({
      booking,
      automationConfig,
      reminder,
      dryRun,
      persistState: false,
      messagePrefix,
    });

    const logs = [
      {
        timestamp: new Date().toISOString(),
        automation: "Waiver Reminder Test",
        property: propertyName,
        action: `Booking ${bookingId} is missing the selected form; testing ${formSource === "internal" ? "Lodgify" : "SendGrid"} waiver reminder "${reminder.label || `${reminder.daysBeforeCheckin}-day`}".`,
        status: "info",
        bookingId,
      },
      resultLog(sendResult, propertyName),
    ];
    const hasFailed = logs.some((log) => log.status === "failed");
    return NextResponse.json({
      status: hasFailed ? "FAILED" : "SUCCESS",
      timestamp: new Date().toISOString(),
      logs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Waiver reminder test failed." },
      { status: 500 }
    );
  }
}
