import { NextResponse } from "next/server";
import { CRON_SECRET } from "@/config/keys";
import { sendSms, validateTwilioConfig } from "@/lib/twilio";
import { getConfig } from "@/lib/kv";
import { getProperties, getAvailability, getBookings, getAllBookings } from "@/lib/lodgify";
import { getFormSubmissions, bookingHasWaiver, extractClientContact } from "@/lib/jotform";
import { appendLogs, writeLastRunStatus } from "@/lib/activity-log";
import {
  sendTemplateEmail,
  getContactsFromList,
  getContactsFromListDetailed,
  getContactByEmailDetailed,
  updateContactCustomFields,
  upsertContactsToList,
} from "@/lib/sendgrid";

const DRY_RUN_ENV = process.env.CRON_DRY_RUN === "true";

function today() {
  return new Date().toISOString().split("T")[0];
}

/** Today's date in America/Chicago — use for waiver logic so "0 days before" matches the business day. */
function todayCentral() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const d = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${d}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Normalize any date-like value to YYYY-MM-DD for comparison. */
function toDateOnly(val) {
  if (val == null) return "";
  if (typeof val === "string") return val.slice(0, 10);
  const d = new Date(val);
  return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function parseCentralDateField(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    const parsed = new Date(millis);
    if (isNaN(parsed.getTime())) return "";
    return parsed.toISOString().split("T")[0];
  }

  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      const millis = raw.length > 10 ? numeric : numeric * 1000;
      const parsed = new Date(millis);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split("T")[0];
      }
    }
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [month, day, year] = raw.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

function parseSentTemplateIds(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifySentTemplateIds(templateIds) {
  return Array.from(new Set(templateIds.map((id) => String(id || "").trim()).filter(Boolean))).join(",");
}

function mergeClientContact(existing, incoming) {
  return {
    email: incoming.email || existing.email,
    firstName: existing.firstName || incoming.firstName || "",
    lastName: existing.lastName || incoming.lastName || "",
    phone: existing.phone || incoming.phone || "",
    submissionIds: Array.from(new Set([...(existing.submissionIds || []), ...(incoming.submissionIds || [])])),
    formIds: Array.from(new Set([...(existing.formIds || []), ...(incoming.formIds || [])])),
    bookingIds: Array.from(new Set([...(existing.bookingIds || []), ...(incoming.bookingIds || [])])),
    bookingStatuses: Array.from(new Set([...(existing.bookingStatuses || []), ...(incoming.bookingStatuses || [])])),
    propertyNames: Array.from(new Set([...(existing.propertyNames || []), ...(incoming.propertyNames || [])])),
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function splitName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function getFirstNonEmpty(values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function extractLodgifyContact(booking) {
  const guest = booking?.guest || {};
  const customer = booking?.customer || {};
  const traveler = booking?.traveler || {};
  const primaryPhoneObject = guest?.phone || customer?.phone || traveler?.phone || {};

  const email = normalizeEmail(
    getFirstNonEmpty([
      guest?.email,
      customer?.email,
      traveler?.email,
      booking?.guestEmail,
      booking?.email,
      booking?.customerEmail,
    ])
  );

  const fullName = getFirstNonEmpty([
    guest?.name,
    booking?.guestName,
    customer?.name,
    traveler?.name,
    `${guest?.firstName || guest?.first_name || ""} ${guest?.lastName || guest?.last_name || ""}`,
    `${customer?.firstName || customer?.first_name || ""} ${customer?.lastName || customer?.last_name || ""}`,
  ]);

  const derivedNames = splitName(fullName);

  const firstName = getFirstNonEmpty([
    guest?.firstName,
    guest?.first_name,
    customer?.firstName,
    customer?.first_name,
    traveler?.firstName,
    traveler?.first_name,
    derivedNames.firstName,
  ]);

  const lastName = getFirstNonEmpty([
    guest?.lastName,
    guest?.last_name,
    customer?.lastName,
    customer?.last_name,
    traveler?.lastName,
    traveler?.last_name,
    derivedNames.lastName,
  ]);

  const phone = normalizePhoneNumber(
    getFirstNonEmpty([
      typeof primaryPhoneObject === "string" ? primaryPhoneObject : "",
      primaryPhoneObject?.fullNumber,
      primaryPhoneObject?.phone,
      primaryPhoneObject?.number,
      primaryPhoneObject?.e164Phone,
      guest?.phoneNumber,
      guest?.mobilePhone,
      customer?.phoneNumber,
      customer?.mobilePhone,
      traveler?.phoneNumber,
      traveler?.mobilePhone,
      booking?.phone,
      booking?.phoneNumber,
      booking?.guestPhone,
    ])
  );

  const bookingId = String(
    booking?.id ||
      booking?.bookingId ||
      booking?.reservationId ||
      booking?.reservation_id ||
      ""
  ).trim();

  const bookingStatus = String(
    booking?.status ||
      booking?.booking_status ||
      booking?.reservationStatus ||
      booking?.reservation_status ||
      ""
  ).trim();

  const propertyName = getFirstNonEmpty([
    booking?.property_name,
    booking?.propertyName,
    booking?.property?.name,
  ]);

  return {
    email,
    firstName,
    lastName,
    phone,
    bookingId,
    bookingStatus,
    propertyName,
  };
}

function isCancelledBooking(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return (
    normalized.includes("cancel") ||
    normalized.includes("canceled") ||
    normalized.includes("cancelled")
  );
}

function parseSelectedAutomations(request) {
  const raw =
    request.headers.get("x-automation") ||
    request.nextUrl?.searchParams?.get("automation") ||
    "";

  const items = String(raw)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const aliases = {
    vacancy: "vacancy",
    "vacancy-emails": "vacancy",
    waiver: "waiver",
    "waiver-reminders": "waiver",
    popup: "popup",
    "popup-followups": "popup",
    "popup-follow-ups": "popup",
    jotform: "jotform-sync",
    "jotform-sync": "jotform-sync",
    "jotform-client-sync": "jotform-sync",
    lodgify: "lodgify-sync",
    "lodgify-sync": "lodgify-sync",
    "lodgify-client-sync": "lodgify-sync",
    syncs: "syncs",
    clients: "syncs",
    "client-sync": "syncs",
  };

  const normalized = items
    .map((item) => aliases[item] || "")
    .filter(Boolean);

  return new Set(normalized);
}

function parsePopupChannelOverride(request) {
  const raw =
    request.headers.get("x-popup-channel") ||
    request.nextUrl?.searchParams?.get("popupChannel") ||
    request.nextUrl?.searchParams?.get("popup_channel") ||
    "";

  const value = String(raw || "").trim().toLowerCase();
  if (["email", "sms", "both"].includes(value)) {
    return value;
  }

  return "";
}

function normalizeChannelMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["email", "sms", "both"].includes(normalized) ? normalized : "email";
}

function parseSentKeys(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifySentKeys(items) {
  return Array.from(
    new Set(items.map((item) => String(item || "").trim()).filter(Boolean))
  ).join(",");
}

function formatSentKeysLabel(items) {
  return items.length > 0 ? items.join(",") : "(none)";
}

function normalizePhoneNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return "+1" + cleaned;
  return cleaned;
}

// ─── Automation 1: Vacancy Promo Emails ─────────────────────────────────────

async function runVacancyEmails(automationConfig, dryRunOverride) {
  const isDryRun = dryRunOverride !== undefined ? dryRunOverride : DRY_RUN_ENV;
  const logs = [];
  const config = automationConfig.vacancyEmails;
  const from = {
    email: automationConfig.sendgrid.fromEmail,
    name: automationConfig.sendgrid.fromName,
  };

  if (!config.enabled) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Vacancy Promo Emails",
      property: "—",
      action: "Skipped (disabled)",
      status: "skipped",
    });
    return logs;
  }

  // Fetch recipient emails from SendGrid contact list (shared in Settings)
  let recipients = [];
  try {
    const contactListId =
      automationConfig.sendgrid?.sendgridContactListId ||
      config.sendgridContactListId;
    if (!contactListId) {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Vacancy Promo Emails",
        property: "—",
        action: "No SendGrid contact list ID in Settings — skipped",
        status: "skipped",
      });
      return logs;
    }
    recipients = await getContactsFromList(contactListId);
    if (recipients.length === 0) {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Vacancy Promo Emails",
        property: "—",
        action: "No contacts in SendGrid list — skipped",
        status: "skipped",
      });
      return logs;
    }
  } catch (err) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Vacancy Promo Emails",
      property: "—",
      action: `Failed to fetch SendGrid contacts: ${err.message}`,
      status: "failed",
    });
    return logs;
  }

  try {
    const properties = await getProperties();
    const todayStr = today();
    const endDate = addDays(todayStr, 30);

    for (const property of properties) {
      try {
        const availability = await getAvailability(
          property.id,
          todayStr,
          endDate
        );

        const vacantPeriods = Array.isArray(availability)
          ? availability.filter((period) => period.is_available)
          : [];

        for (const period of vacantPeriods) {
          const startDate = period.start_date || period.startDate;
          if (!startDate) continue;

          const daysUntil = daysBetween(todayStr, startDate);

          for (const window of config.windows) {
            if (daysUntil === window.daysBeforeCheckin) {
              // Send to every contact in the SendGrid list
              for (const email of recipients) {
                try {
                  if (!isDryRun) {
                  await sendTemplateEmail({
                    to: email,
                    templateId: window.templateId,
                    from,
                    data: {
                      propertyName: property.name,
                      checkinDate: startDate,
                      daysUntilAvailable: window.daysBeforeCheckin,
                    },
                  });

                  }
                  logs.push({
                    timestamp: new Date().toISOString(),
                    automation: "Vacancy Promo Emails",
                    property: property.name,
                    action: isDryRun
                      ? `[DRY RUN] Would have sent ${window.daysBeforeCheckin}-day promo to ${email}`
                      : `Sent ${window.daysBeforeCheckin}-day promo to ${email} (${window.templateId})`,
                    status: "success",
                  });
                } catch (err) {
                  logs.push({
                    timestamp: new Date().toISOString(),
                    automation: "Vacancy Promo Emails",
                    property: property.name,
                    action: `Failed ${window.daysBeforeCheckin}-day promo to ${email}: ${err.message}`,
                    status: "failed",
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Vacancy Promo Emails",
          property: property.name,
          action: `Failed to fetch availability: ${err.message}`,
          status: "failed",
        });
      }
    }
  } catch (err) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Vacancy Promo Emails",
      property: "—",
      action: `Failed to fetch properties: ${err.message}`,
      status: "failed",
    });
  }

  return logs;
}

// ─── Automation 2: Jotform Waiver Emails ─────────────────────────────────────
// Uses the same Jotform form for all reminders. Sent only if guest hasn't submitted yet.
// When it runs is controlled by the cron schedule; days and template IDs are set per waiver in the dashboard.

async function runWaiverReminders(automationConfig, dryRunOverride) {
  const isDryRun = dryRunOverride !== undefined ? dryRunOverride : DRY_RUN_ENV;
  const logs = [];
  const config = automationConfig.waiverReminders;
  const from = {
    email: automationConfig.sendgrid.fromEmail,
    name: automationConfig.sendgrid.fromName,
  };

  if (!config.enabled) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Waiver Emails",
      property: "—",
      action: "Skipped (disabled)",
      status: "skipped",
    });
    return logs;
  }

  const jotformFormId =
    config.jotformFormId || config.reminders?.[0]?.jotformFormId;
  if (!jotformFormId) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Waiver Emails",
      property: "—",
      action: "Skipped: no Jotform form ID configured",
      status: "skipped",
    });
    return logs;
  }

  const rawReminders = config.emails || config.reminders || [];
  // Use whatever days are configured per waiver; dedupe by daysBeforeCheckin so we don't send twice for same window
  const reminders = rawReminders.filter(
    (r, i, arr) =>
      arr.findIndex((x) => x.daysBeforeCheckin === r.daysBeforeCheckin) === i
  );
  const todayStr = todayCentral();
  const waiverUrl = `https://form.jotform.com/${jotformFormId}`;

  if (reminders.length === 0) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Waiver Emails",
      property: "—",
      action: "Skipped: no waiver reminder windows configured (emails/reminders empty)",
      status: "skipped",
    });
    return logs;
  }

  // Fetch Jotform submissions once (avoids ~140 API calls per run)
  let jotformSubmissions = [];
  try {
    jotformSubmissions = await getFormSubmissions(jotformFormId);
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Waiver Emails",
      property: "—",
      action: `Loaded ${jotformSubmissions.length} Jotform waiver submission(s)`,
      status: "info",
    });
  } catch (err) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Waiver Emails",
      property: "—",
      action: `JotForm API failed — skipping all waiver emails: ${err.message}`,
      status: "failed",
    });
    return logs;
  }

  // DRY RUN header: explicit date breakdown for validation
  if (isDryRun) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Waiver Emails",
      property: "—",
      action: `═══ DRY RUN: Today is ${todayStr}. No emails sent. Validation: WHO would receive WHAT (compare with Lodgify + Jotform) ═══`,
      status: "info",
    });
  }

  for (const reminder of reminders) {
    const targetDate = addDays(todayStr, reminder.daysBeforeCheckin);
    const label = reminder.label || `${reminder.daysBeforeCheckin}-day`;
    const daysLabel =
      reminder.daysBeforeCheckin === 0
        ? "today"
        : reminder.daysBeforeCheckin === 1
          ? "1 day from now"
          : `${reminder.daysBeforeCheckin} days from now`;

    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Waiver Emails",
      property: "—",
      action: `--- Check-ins on ${targetDate} (${daysLabel}) → would send "${label}" to: ---`,
      status: "info",
    });

    try {
      let bookings = await getBookings(targetDate, targetDate);

      // Filter to only bookings that CHECK IN on targetDate (Lodgify stayFrom/stayTo may return overlapping stays)
      const targetDateStr = targetDate;
      bookings = bookings.filter((b) => {
        const arrival = b.arrival || b.start_date || b.checkIn || b.checkin_date;
        return toDateOnly(arrival) === targetDateStr;
      });

      // Optional: restrict to specific property IDs (e.g. Zenfulcove only)
      const propertyIds = config.propertyIds;
      if (Array.isArray(propertyIds) && propertyIds.length > 0) {
        bookings = bookings.filter(
          (b) => propertyIds.includes(String(b.property_id ?? b.propertyId ?? ""))
        );
      }

      // Deduplicate by booking ID so we never send two waiver emails for the same booking in this run
      const seenBookingIds = new Set();
      bookings = bookings.filter((b) => {
        const id = String(b.id);
        if (seenBookingIds.has(id)) return false;
        seenBookingIds.add(id);
        return true;
      });

      for (const booking of bookings) {
        const guestEmail = booking.guest?.email || booking.email;
        const guestName = booking.guest?.name || booking.guestName || "Guest";
        const bookingId = String(booking.id);
        const propertyName =
          booking.property_name || booking.propertyName || "Property";

        if (!guestEmail) {
          logs.push({
            timestamp: new Date().toISOString(),
            automation: "Jotform Waiver Emails",
            property: propertyName,
            action: isDryRun
              ? `[DRY RUN] SKIP booking ${bookingId} | no guest email`
              : `No email for booking ${bookingId} — skipped (${reminder.daysBeforeCheckin}-day)`,
            status: "skipped",
          });
          continue;
        }

        if (!reminder.templateId || String(reminder.templateId).trim() === "") {
          logs.push({
            timestamp: new Date().toISOString(),
            automation: "Jotform Waiver Emails",
            property: propertyName,
            action: `SKIP booking ${bookingId} — no SendGrid template ID for "${reminder.label || reminder.daysBeforeCheckin}-day"`,
            status: "skipped",
          });
          continue;
        }

        try {
          const hasWaiver = bookingHasWaiver(bookingId, jotformSubmissions);

          if (!hasWaiver) {
            if (!isDryRun) {
              await sendTemplateEmail({
                to: guestEmail,
                templateId: reminder.templateId,
                from,
                data: {
                  guestName,
                  propertyName,
                  checkinDate: targetDate,
                  bookingId,
                  waiverUrl,
                },
              });
            }

            logs.push({
              timestamp: new Date().toISOString(),
              automation: "Jotform Waiver Emails",
              property: propertyName,
              action: isDryRun
                ? `[DRY RUN] Would send "${reminder.label || `${reminder.daysBeforeCheckin}-day`}" to ${guestEmail} | booking ${bookingId} | ${propertyName} | no Jotform waiver for booking ${bookingId}`
                : `Sent ${reminder.label || `${reminder.daysBeforeCheckin}-day`} to ${guestEmail} (booking ${bookingId})`,
              status: "success",
            });
          } else {
            logs.push({
              timestamp: new Date().toISOString(),
              automation: "Jotform Waiver Emails",
              property: propertyName,
              action: isDryRun
                ? `[DRY RUN] SKIP ${guestEmail} | booking ${bookingId} | waiver already in Jotform (booking ID matched)`
                : `Waiver already submitted for booking ${bookingId}`,
              status: "skipped",
            });
          }
        } catch (err) {
          // SendGrid errors include response.body with the actual reason (rate limit, unverified sender, etc.)
          const detail =
            err.response?.body?.errors?.[0]?.message || err.message;
          logs.push({
            timestamp: new Date().toISOString(),
            automation: "Jotform Waiver Emails",
            property: propertyName,
            action: `Failed ${reminder.label || `${reminder.daysBeforeCheckin}-day`} for booking ${bookingId}: ${detail}`,
            status: "failed",
          });
        }
      }
    } catch (err) {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Jotform Waiver Emails",
        property: "—",
        action: `Failed to fetch bookings for ${targetDate} (${label}): ${err.message}`,
        status: "failed",
      });
    }
  }

  return logs;
}

// ─── Automation 3: Popup Follow Ups ─────────────────────────────────────────

export async function runPopupFollowups(automationConfig, dryRunOverride, popupChannelOverride = "", options = {}) {
  const isDryRun = dryRunOverride !== undefined ? dryRunOverride : DRY_RUN_ENV;
  const logs = [];
  const config = automationConfig.popupFollowups || {};
  const from = {
    email: automationConfig.sendgrid.fromEmail,
    name: automationConfig.sendgrid.fromName,
  };
  const effectiveChannelMode = popupChannelOverride || normalizeChannelMode(config.channelMode);
  const shouldRunEmail = effectiveChannelMode === "email" || effectiveChannelMode === "both";
  const shouldRunSms = effectiveChannelMode === "sms" || effectiveChannelMode === "both";
  const testDestination = String(options.testDestination || "").trim();
  const isOneOffTest = Boolean(testDestination);
  const shouldPersistState = options.persistState !== false && !isOneOffTest && !isDryRun;
  const maxSends = Number.isFinite(options.maxSends) ? Number(options.maxSends) : Number.POSITIVE_INFINITY;
  let sentCount = 0;

  if (!config.enabled) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: "Skipped (disabled)",
      status: "skipped",
    });
    return logs;
  }

  if (!config.sendgridContactListId) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: "Skipped: no SendGrid contact list ID configured",
      status: "skipped",
    });
    return logs;
  }

  if (!config.popupTriggeredFieldId || !config.popupSentTemplatesFieldId || !config.popupSentSmsFieldId) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: "Skipped: popup custom field keys are incomplete",
      status: "skipped",
    });
    return logs;
  }

  const configuredEmails = shouldRunEmail ? (config.emails || []).filter(Boolean) : [];
  const configuredSms = shouldRunSms
    ? (config.sms || []).filter((item) => item && item.enabled !== false)
    : [];

  if (!shouldRunEmail && !shouldRunSms) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: "Skipped: popup channel mode is invalid",
      status: "skipped",
    });
    return logs;
  }

  if (shouldRunEmail && configuredEmails.length === 0 && !shouldRunSms) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: "Skipped: no popup follow-up windows configured",
      status: "skipped",
    });
    return logs;
  }

  if (shouldRunSms && configuredSms.length === 0 && !shouldRunEmail) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: "Skipped: no popup SMS follow-up windows configured",
      status: "skipped",
    });
    return logs;
  }

  if (shouldRunSms) {
    try {
      validateTwilioConfig();
    } catch (err) {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Popup Follow Ups",
        property: "—",
        action: `Skipped: ${err.message}`,
        status: "skipped",
      });
      return logs;
    }
  }

  let contacts = [];
  try {
    contacts = await getContactsFromListDetailed(config.sendgridContactListId);
  } catch (err) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: `Failed to fetch popup contacts: ${err.message}`,
      status: "failed",
    });
    return logs;
  }

  if (contacts.length === 0) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: "No contacts in popup follow-up list — skipped",
      status: "skipped",
    });
    return logs;
  }

  const todayStr = todayCentral();
  const maxConfiguredDay = Math.max(
    0,
    ...(shouldRunEmail ? configuredEmails.map((item) => Number(item.daysAfterTrigger) || 0) : []),
    ...(shouldRunSms ? configuredSms.map((item) => Number(item.daysAfterTrigger) || 0) : [])
  );
  const contactsWithinWindow = contacts
    .map((contact) => {
      const customFields = contact?.custom_fields || {};
      const triggerDate = parseCentralDateField(customFields[config.popupTriggeredFieldId]);
      return {
        ...contact,
        _popupTriggerDate: triggerDate,
      };
    })
    .filter((contact) => {
      if (!contact._popupTriggerDate) return false;
      const daysSinceTriggered = daysBetween(contact._popupTriggerDate, todayStr);
      return daysSinceTriggered >= 0 && daysSinceTriggered <= maxConfiguredDay;
    })
    .sort((a, b) => String(b._popupTriggerDate).localeCompare(String(a._popupTriggerDate)));

  if (isDryRun) {
    const descriptor =
      shouldRunEmail && shouldRunSms
        ? "popup follow-up emails or SMS messages"
        : shouldRunSms
          ? "popup follow-up SMS messages"
          : "popup follow-up emails";
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: `═══ DRY RUN: Today is ${todayStr}. No ${descriptor} will be sent. Validation: WHO would receive WHAT. ═══`,
      status: "info",
    });
  }

  logs.push({
    timestamp: new Date().toISOString(),
    automation: "Popup Follow Ups",
    property: "—",
    action: `Using SendGrid popup list: ${config.sendgridContactListId}`,
    status: "info",
  });

  const contactsWithPhone = contacts.filter((contact) =>
    Boolean(normalizePhoneNumber(contact?.phone_number || contact?.phone || ""))
  ).length;
  const contactsWithoutPhone = contacts.length - contactsWithPhone;

  logs.push({
    timestamp: new Date().toISOString(),
    automation: "Popup Follow Ups",
    property: "—",
    action: `Popup list phone coverage: ${contactsWithPhone} with phone, ${contactsWithoutPhone} without phone`,
    status: "info",
  });

  logs.push({
    timestamp: new Date().toISOString(),
    automation: "Popup Follow Ups",
    property: "—",
    action: `Loaded ${contacts.length} popup contact(s); ${contactsWithinWindow.length} in active ${maxConfiguredDay}-day follow-up window (newest first)`,
    status: "info",
  });

  if (contactsWithinWindow.length === 0) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: "No popup contacts currently fall inside the active follow-up day window",
      status: "info",
    });
    return logs;
  }

  const contactHydrationCache = new Map();

  for (const contact of contactsWithinWindow) {
    const email = String(contact?.email || "").trim().toLowerCase();
    let phone = normalizePhoneNumber(contact?.phone_number || contact?.phone || "");
    const customFields = contact?.custom_fields || {};
    const rawTriggerDate = customFields[config.popupTriggeredFieldId];
    const triggerDate = contact._popupTriggerDate || parseCentralDateField(rawTriggerDate);

    if (!email) {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Popup Follow Ups",
        property: "—",
        action: "Skipped contact with no email in popup list",
        status: "skipped",
      });
      continue;
    }

    if (!triggerDate) {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Popup Follow Ups",
        property: "—",
        action: `SKIP ${email} — missing or invalid popup trigger date`,
        status: "skipped",
      });
      continue;
    }

    const daysSinceTriggered = daysBetween(triggerDate, todayStr);
    if (daysSinceTriggered < 0) {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Popup Follow Ups",
        property: "—",
        action: `SKIP ${email} — popup trigger date ${triggerDate} is in the future`,
        status: "skipped",
      });
      continue;
    }

    const sentTemplateIds = new Set(
      parseSentKeys(customFields[config.popupSentTemplatesFieldId])
    );
    const sentSmsKeys = new Set(
      parseSentKeys(customFields[config.popupSentSmsFieldId])
    );

    const matchedEmails = configuredEmails.filter(
      (item) => Number(item.daysAfterTrigger) === daysSinceTriggered
    );
    const matchedSms = configuredSms.filter(
      (item) => Number(item.daysAfterTrigger) === daysSinceTriggered
    );

    if (shouldRunSms && !phone && matchedSms.length > 0 && email) {
      try {
        let hydrated = contactHydrationCache.get(email);
        if (hydrated === undefined) {
          hydrated = await getContactByEmailDetailed(email);
          contactHydrationCache.set(email, hydrated || null);
        }

        const hydratedPhone = normalizePhoneNumber(
          hydrated?.phone_number || hydrated?.phone || ""
        );
        if (hydratedPhone) {
          phone = hydratedPhone;
          logs.push({
            timestamp: new Date().toISOString(),
            automation: "Popup Follow Ups",
            property: "—",
            action: `Hydrated missing phone for ${email} via direct SendGrid contact lookup`,
            status: "info",
          });
        }
      } catch (err) {
        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Popup Follow Ups",
          property: "—",
          action: `Failed to hydrate phone for ${email}: ${err.message}`,
          status: "failed",
        });
      }
    }

    if (shouldRunEmail && matchedEmails.length === 0) {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Popup Follow Ups",
        property: "—",
        action: `NO SEND ${email} | triggered ${triggerDate} | ${daysSinceTriggered} days since popup | no email follow-up configured for today | sent: ${formatSentKeysLabel(Array.from(sentTemplateIds))}`,
        status: "info",
      });
    }

    if (shouldRunSms && matchedSms.length === 0) {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Popup Follow Ups",
        property: "—",
        action: `NO SEND ${phone || email} | triggered ${triggerDate} | ${daysSinceTriggered} days since popup | no SMS follow-up configured for today | sent: ${formatSentKeysLabel(Array.from(sentSmsKeys))}`,
        status: "info",
      });
    }

    for (const followup of matchedEmails) {
      const label = followup.label || `${followup.daysAfterTrigger}-day`;
      const templateId = String(followup.templateId || "").trim();
      const sentTemplatesLabel = formatSentKeysLabel(Array.from(sentTemplateIds));
      const emailDestination = isOneOffTest ? testDestination : email;

      if (!templateId) {
        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Popup Follow Ups",
          property: "—",
          action: `SKIP ${email} | triggered ${triggerDate} | ${daysSinceTriggered} days since popup | no template ID configured for "${label}" | sent: ${sentTemplatesLabel}`,
          status: "skipped",
        });
        continue;
      }

      if (sentTemplateIds.has(templateId)) {
        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Popup Follow Ups",
          property: "—",
          action: `SKIP ${email} | triggered ${triggerDate} | ${daysSinceTriggered} days since popup | template already sent: ${templateId} | sent: ${sentTemplatesLabel}`,
          status: "skipped",
        });
        continue;
      }

      try {
        if (!isDryRun) {
          await sendTemplateEmail({
            to: emailDestination,
            templateId,
            from,
            data: {
              first_name: contact?.first_name || contact?.firstName || "",
              last_name: contact?.last_name || contact?.lastName || "",
              email,
              popup_triggered_at: triggerDate,
              days_since_trigger: followup.daysAfterTrigger,
              followup_label: label,
            },
          });

          if (shouldPersistState) {
            sentTemplateIds.add(templateId);
            await updateContactCustomFields({
              email,
              customFields: {
                [config.popupTriggeredFieldId]: rawTriggerDate,
                [config.popupSentTemplatesFieldId]: stringifySentKeys(
                  Array.from(sentTemplateIds)
                ),
                [config.popupSentSmsFieldId]: stringifySentKeys(
                  Array.from(sentSmsKeys)
                ),
              },
            });
          }
        }

        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Popup Follow Ups",
          property: "—",
          action: isDryRun
            ? `[DRY RUN] Would send "${label}" to ${email} (${templateId}) | triggered ${triggerDate} | ${followup.daysAfterTrigger} days since popup | sent: ${sentTemplatesLabel}`
            : isOneOffTest
              ? `[TEST SEND] Routed email "${label}" originally for ${email} to ${emailDestination} (${templateId})`
              : `Sent "${label}" to ${email} (${templateId}) | triggered ${triggerDate} | sent before update: ${sentTemplatesLabel}`,
          status: "success",
        });

        if (!isDryRun) {
          sentCount += 1;
          if (sentCount >= maxSends) {
            return logs;
          }
        }
      } catch (err) {
        const detail = err.response?.body?.errors?.[0]?.message || err.message;
        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Popup Follow Ups",
          property: "—",
          action: `Failed "${label}" for ${email}: ${detail}`,
          status: "failed",
        });
      }
    }

    for (const smsFollowup of matchedSms) {
      const label =
        smsFollowup.label || `${smsFollowup.daysAfterTrigger}-day SMS`;
      const messageKey = String(smsFollowup.messageKey || "").trim();
      const messageBody = String(smsFollowup.messageBody || "").trim();
      const sentSmsLabel = formatSentKeysLabel(Array.from(sentSmsKeys));
      const sendTo = isOneOffTest ? normalizePhoneNumber(testDestination) : phone;
      const isTestSend = !isDryRun && isOneOffTest;

      if (!messageKey) {
        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Popup Follow Ups",
          property: "—",
          action: `SKIP ${phone || email} | triggered ${triggerDate} | ${daysSinceTriggered} days since popup | no SMS key configured for "${label}" | sent: ${sentSmsLabel}`,
          status: "skipped",
        });
        continue;
      }

      if (!messageBody) {
        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Popup Follow Ups",
          property: "—",
          action: `SKIP ${phone || email} | triggered ${triggerDate} | ${daysSinceTriggered} days since popup | no message body configured for "${label}" | sent: ${sentSmsLabel}`,
          status: "skipped",
        });
        continue;
      }

      if (!phone) {
        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Popup Follow Ups",
          property: "—",
          action: `SKIP ${email} | triggered ${triggerDate} | ${daysSinceTriggered} days since popup | no phone number | sent: ${sentSmsLabel}`,
          status: "skipped",
        });
        continue;
      }

      if (sentSmsKeys.has(messageKey)) {
        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Popup Follow Ups",
          property: "—",
          action: `SKIP ${phone} | triggered ${triggerDate} | ${daysSinceTriggered} days since popup | SMS already sent: ${messageKey} | sent: ${sentSmsLabel}`,
          status: "skipped",
        });
        continue;
      }

      try {
        let smsResult = null;
        if (!isDryRun) {
          smsResult = await sendSms({
            to: sendTo,
            body: messageBody,
                      });

          if (shouldPersistState) {
            sentSmsKeys.add(messageKey);
            await updateContactCustomFields({
              email,
              customFields: {
                [config.popupTriggeredFieldId]: rawTriggerDate,
                [config.popupSentTemplatesFieldId]: stringifySentKeys(
                  Array.from(sentTemplateIds)
                ),
                [config.popupSentSmsFieldId]: stringifySentKeys(
                  Array.from(sentSmsKeys)
                ),
              },
            });
          }
        }

        const sidSuffix = smsResult?.sid ? ` | sid: ${smsResult.sid}` : "";
        const action = isDryRun
          ? `[DRY RUN] Would send SMS "${label}" to ${phone} (${messageKey}) | triggered ${triggerDate} | ${smsFollowup.daysAfterTrigger} days since popup | sent: ${sentSmsLabel}`
          : isTestSend
            ? `[TEST SEND] Routed SMS "${label}" originally for ${phone} to ${sendTo} (${messageKey})${sidSuffix}`
            : `Sent SMS "${label}" to ${phone} (${messageKey})${sidSuffix}`;

        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Popup Follow Ups",
          property: "—",
          action,
          status: "success",
        });

        if (!isDryRun) {
          sentCount += 1;
          if (sentCount >= maxSends) {
            return logs;
          }
        }
      } catch (err) {
        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Popup Follow Ups",
          property: "—",
          action: `Failed SMS "${label}" for ${phone}: ${err.message}`,
          status: "failed",
        });
      }
    }
  }

  return logs;
}

async function runJotformClientSync(automationConfig, dryRunOverride) {
  const isDryRun = dryRunOverride !== undefined ? dryRunOverride : DRY_RUN_ENV;
  const logs = [];
  const config = automationConfig.jotformClientSync || {};
  const formIds = (config.jotformFormIds || []).map((id) => String(id || "").trim()).filter(Boolean);

  if (!config.enabled) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Client Sync",
      property: "—",
      action: "Skipped (disabled)",
      status: "skipped",
    });
    return logs;
  }

  if (!config.sendgridContactListId) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Client Sync",
      property: "—",
      action: "Skipped: no SendGrid master list ID configured",
      status: "skipped",
    });
    return logs;
  }

  if (formIds.length === 0) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Client Sync",
      property: "—",
      action: "Skipped: no Jotform form IDs configured",
      status: "skipped",
    });
    return logs;
  }

  if (isDryRun) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Client Sync",
      property: "—",
      action: "═══ DRY RUN: No SendGrid contacts will be written. Validation: WHICH client records would be synced. ═══",
      status: "info",
    });
  }

  const dedupedContacts = new Map();
  let totalSubmissions = 0;
  let missingEmailCount = 0;

  for (const formId of formIds) {
    let submissions = [];
    try {
      submissions = await getFormSubmissions(formId);
      totalSubmissions += submissions.length;
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Jotform Client Sync",
        property: "—",
        action: `Loaded ${submissions.length} submission(s) from Jotform form ${formId}`,
        status: "info",
      });
    } catch (err) {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Jotform Client Sync",
        property: "—",
        action: `Failed to fetch Jotform form ${formId}: ${err.message}`,
        status: "failed",
      });
      continue;
    }

    for (const submission of submissions) {
      const contact = extractClientContact(submission);
      if (!contact.email) {
        missingEmailCount += 1;
        continue;
      }

      const merged = mergeClientContact(
        dedupedContacts.get(contact.email) || {
          email: contact.email,
          firstName: "",
          lastName: "",
          phone: "",
          submissionIds: [],
          formIds: [],
        },
        {
          ...contact,
          submissionIds: contact.submissionId ? [contact.submissionId] : [],
          formIds: [formId],
        }
      );
      dedupedContacts.set(contact.email, merged);
    }
  }

  const contactsToSync = Array.from(dedupedContacts.values());
  logs.push({
    timestamp: new Date().toISOString(),
    automation: "Jotform Client Sync",
    property: "—",
    action: `Prepared ${contactsToSync.length} unique contact(s) from ${totalSubmissions} Jotform submission(s); skipped ${missingEmailCount} submission(s) with no email`,
    status: "info",
  });

  if (contactsToSync.length === 0) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Client Sync",
      property: "—",
      action: "No eligible contacts found to sync",
      status: "skipped",
    });
    return logs;
  }

  if (isDryRun) {
    contactsToSync.forEach((contact) => {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Jotform Client Sync",
        property: "—",
        action: `[DRY RUN] Would sync ${contact.email} | first: ${contact.firstName || "(blank)"} | last: ${contact.lastName || "(blank)"} | phone: ${contact.phone || "(blank)"} | forms: ${contact.formIds.join(",")} | submissions: ${contact.submissionIds.join(",") || "(unknown)"}`,
        status: "success",
      });
    });
    return logs;
  }

  try {
    const results = await upsertContactsToList({
      listId: config.sendgridContactListId,
      contacts: contactsToSync,
    });
    const requestedCount = results.reduce((sum, item) => sum + Number(item?.results?.requested_count || 0), 0);
    const createdCount = results.reduce((sum, item) => sum + Number(item?.results?.created_count || 0), 0);
    const updatedCount = results.reduce((sum, item) => sum + Number(item?.results?.updated_count || 0), 0);
    const erroredCount = results.reduce((sum, item) => sum + Number(item?.results?.errored_count || 0), 0);
    const pendingCount = results.filter((item) => item?.status === "pending_timeout").length;

    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Client Sync",
      property: "—",
      action: pendingCount > 0
        ? `SendGrid accepted ${contactsToSync.length} contact(s) for sync to list ${config.sendgridContactListId}, but ${pendingCount} batch job(s) were still pending after the wait window | requested: ${requestedCount} | created: ${createdCount} | updated: ${updatedCount} | errored: ${erroredCount}`
        : `Synced ${contactsToSync.length} contact(s) to SendGrid list ${config.sendgridContactListId} | requested: ${requestedCount} | created: ${createdCount} | updated: ${updatedCount} | errored: ${erroredCount}`,
      status: erroredCount > 0 ? "failed" : pendingCount > 0 ? "info" : "success",
    });
  } catch (err) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Jotform Client Sync",
      property: "—",
      action: `Failed to sync contacts to SendGrid: ${err.message}`,
      status: "failed",
    });
  }

  return logs;
}

async function runLodgifyClientSync(automationConfig, dryRunOverride) {
  const isDryRun = dryRunOverride !== undefined ? dryRunOverride : DRY_RUN_ENV;
  const logs = [];
  const config = automationConfig.lodgifyClientSync || {};
  const lookbackDays = Math.max(0, Number(config.stayDateLookbackDays) || 0);
  const lookaheadDays = Math.max(0, Number(config.stayDateLookaheadDays) || 0);
  const includeCancelledBookings = config.includeCancelledBookings !== false;
  const startDate = addDays(todayCentral(), -lookbackDays);
  const endDate = addDays(todayCentral(), lookaheadDays);

  if (!config.enabled) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Lodgify Client Sync",
      property: "—",
      action: "Skipped (disabled)",
      status: "skipped",
    });
    return logs;
  }

  if (!config.sendgridContactListId) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Lodgify Client Sync",
      property: "—",
      action: "Skipped: no SendGrid master list ID configured",
      status: "skipped",
    });
    return logs;
  }

  if (isDryRun) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Lodgify Client Sync",
      property: "—",
      action: `═══ DRY RUN: No SendGrid contacts will be written. Validation: WHICH Lodgify bookings would be synced for stay dates ${startDate} to ${endDate}. ═══`,
      status: "info",
    });
  }

  let bookings = [];
  try {
    bookings = await getAllBookings({
      stayFrom: startDate,
      stayTo: endDate,
      page: 1,
      size: 100,
      includeCount: false,
      includeTransactions: false,
      includeExternal: true,
      includeQuoteDetails: false,
    });
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Lodgify Client Sync",
      property: "—",
      action: `Loaded ${bookings.length} booking(s) from Lodgify for stay dates ${startDate} to ${endDate}`,
      status: "info",
    });
  } catch (err) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Lodgify Client Sync",
      property: "—",
      action: `Failed to fetch Lodgify bookings: ${err.message}`,
      status: "failed",
    });
    return logs;
  }

  const dedupedContacts = new Map();
  let skippedMissingEmailCount = 0;
  let skippedCancelledCount = 0;

  for (const booking of bookings) {
    const contact = extractLodgifyContact(booking);

    if (isCancelledBooking(contact.bookingStatus) && !includeCancelledBookings) {
      skippedCancelledCount += 1;
      continue;
    }

    if (!contact.email) {
      skippedMissingEmailCount += 1;
      continue;
    }

    const merged = mergeClientContact(
      dedupedContacts.get(contact.email) || {
        email: contact.email,
        firstName: "",
        lastName: "",
        phone: "",
        submissionIds: [],
        formIds: [],
        bookingIds: [],
        bookingStatuses: [],
        propertyNames: [],
      },
      {
        ...contact,
        bookingIds: contact.bookingId ? [contact.bookingId] : [],
        bookingStatuses: contact.bookingStatus ? [contact.bookingStatus] : [],
        propertyNames: contact.propertyName ? [contact.propertyName] : [],
      }
    );

    dedupedContacts.set(contact.email, merged);
  }

  const contactsToSync = Array.from(dedupedContacts.values());
  logs.push({
    timestamp: new Date().toISOString(),
    automation: "Lodgify Client Sync",
    property: "—",
    action: `Prepared ${contactsToSync.length} unique contact(s) from ${bookings.length} Lodgify booking(s); skipped ${skippedMissingEmailCount} booking(s) with no email${includeCancelledBookings ? "" : `; skipped ${skippedCancelledCount} cancelled booking(s)`}`,
    status: "info",
  });

  if (contactsToSync.length === 0) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Lodgify Client Sync",
      property: "—",
      action: "No eligible Lodgify contacts found to sync",
      status: "skipped",
    });
    return logs;
  }

  if (isDryRun) {
    contactsToSync.forEach((contact) => {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Lodgify Client Sync",
        property: contact.propertyNames?.join(", ") || "—",
        action: `[DRY RUN] Would sync ${contact.email} | first: ${contact.firstName || "(blank)"} | last: ${contact.lastName || "(blank)"} | phone: ${contact.phone || "(blank)"} | bookings: ${contact.bookingIds.join(",") || "(unknown)"} | statuses: ${contact.bookingStatuses.join(",") || "(unknown)"}`,
        status: "success",
      });
    });
    return logs;
  }

  try {
    const results = await upsertContactsToList({
      listId: config.sendgridContactListId,
      contacts: contactsToSync,
    });
    const requestedCount = results.reduce((sum, item) => sum + Number(item?.results?.requested_count || 0), 0);
    const createdCount = results.reduce((sum, item) => sum + Number(item?.results?.created_count || 0), 0);
    const updatedCount = results.reduce((sum, item) => sum + Number(item?.results?.updated_count || 0), 0);
    const erroredCount = results.reduce((sum, item) => sum + Number(item?.results?.errored_count || 0), 0);
    const pendingCount = results.filter((item) => item?.status === "pending_timeout").length;

    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Lodgify Client Sync",
      property: "—",
      action: pendingCount > 0
        ? `SendGrid accepted ${contactsToSync.length} Lodgify contact(s) for sync to list ${config.sendgridContactListId}, but ${pendingCount} batch job(s) were still pending after the wait window | requested: ${requestedCount} | created: ${createdCount} | updated: ${updatedCount} | errored: ${erroredCount}`
        : `Synced ${contactsToSync.length} Lodgify contact(s) to SendGrid list ${config.sendgridContactListId} | requested: ${requestedCount} | created: ${createdCount} | updated: ${updatedCount} | errored: ${erroredCount}`,
      status: erroredCount > 0 ? "failed" : pendingCount > 0 ? "info" : "success",
    });
  } catch (err) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Lodgify Client Sync",
      property: "—",
      action: `Failed to sync Lodgify contacts to SendGrid: ${err.message}`,
      status: "failed",
    });
  }

  return logs;
}

// ─── POST handler ───────────────────────────────────────────────────────────

export async function POST(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read live config from KV (reflects dashboard edits)
  const automationConfig = await getConfig();

  const forceDryRun = request.headers.get("x-dry-run") === "true";
  const isDryRun = DRY_RUN_ENV || forceDryRun;
  const selectedAutomations = parseSelectedAutomations(request);
  const popupChannelOverride = parsePopupChannelOverride(request);
  const runAllAutomations = selectedAutomations.size === 0;

  if (isDryRun) {
    const todayStr = today();
    console.log(`[cron] DRY RUN — no emails will be sent. Today: ${todayStr}. Validation: WHO would receive WHAT.`);
  }

  const allLogs = [];

  if (runAllAutomations || selectedAutomations.has("vacancy")) {
    const vacancyLogs = await runVacancyEmails(automationConfig, isDryRun);
    allLogs.push(...vacancyLogs);
  }

  if (runAllAutomations || selectedAutomations.has("waiver")) {
    const waiverLogs = await runWaiverReminders(automationConfig, isDryRun);
    allLogs.push(...waiverLogs);
  }

  if (runAllAutomations || selectedAutomations.has("popup")) {
    const popupLogs = await runPopupFollowups(automationConfig, isDryRun, popupChannelOverride);
    allLogs.push(...popupLogs);
  }

  if (
    runAllAutomations ||
    selectedAutomations.has("jotform-sync") ||
    selectedAutomations.has("syncs")
  ) {
    const jotformSyncLogs = await runJotformClientSync(automationConfig, isDryRun);
    allLogs.push(...jotformSyncLogs);
  }

  if (
    runAllAutomations ||
    selectedAutomations.has("lodgify-sync") ||
    selectedAutomations.has("syncs")
  ) {
    const lodgifySyncLogs = await runLodgifyClientSync(automationConfig, isDryRun);
    allLogs.push(...lodgifySyncLogs);
  }

  await appendLogs(allLogs);

  const hasFailed = allLogs.some((log) => log.status === "failed");
  await writeLastRunStatus(hasFailed ? "FAILED" : "SUCCESS");

  // Log to terminal for quick debugging (dev server stdout)
  const icon = (s) => (s === "success" ? "✓" : s === "failed" ? "✗" : s === "info" ? "→" : "○");
  allLogs.forEach((l) =>
    console.log(`[cron] ${icon(l.status)} [${l.automation}] ${l.action}`)
  );

  return NextResponse.json({
    status: hasFailed ? "FAILED" : "SUCCESS",
    timestamp: new Date().toISOString(),
    logsCount: allLogs.length,
    logs: allLogs,
  });
}

// Also support GET for Vercel Cron (Vercel crons use GET by default)
export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return POST(request);
}
