import { NextResponse } from "next/server";
import { CRON_SECRET } from "@/config/keys";
import { getConfig } from "@/lib/kv";
import { getProperties, getAvailability, getBookings } from "@/lib/lodgify";
import { getFormSubmissions, bookingHasWaiver } from "@/lib/jotform";
import {
  sendTemplateEmail,
  getContactsFromList,
  getContactsFromListDetailed,
  updateContactCustomFields,
} from "@/lib/sendgrid";
import fs from "fs/promises";
import path from "path";

const LOGS_PATH = path.join(process.cwd(), "logs", "activity.json");
const LAST_RUN_PATH = path.join(process.cwd(), "logs", "last-run.json");
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

async function appendLogs(newEntries) {
  let existing = [];
  try {
    const raw = await fs.readFile(LOGS_PATH, "utf-8");
    existing = JSON.parse(raw);
  } catch {
    // File doesn't exist or is invalid — start fresh
  }
  existing.push(...newEntries);
  await fs.writeFile(LOGS_PATH, JSON.stringify(existing, null, 2));
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

async function runPopupFollowups(automationConfig, dryRunOverride) {
  const isDryRun = dryRunOverride !== undefined ? dryRunOverride : DRY_RUN_ENV;
  const logs = [];
  const config = automationConfig.popupFollowups || {};
  const from = {
    email: automationConfig.sendgrid.fromEmail,
    name: automationConfig.sendgrid.fromName,
  };

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

  if (!config.popupTriggeredFieldId || !config.popupSentTemplatesFieldId) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: "Skipped: popup custom field IDs are incomplete",
      status: "skipped",
    });
    return logs;
  }

  const configuredEmails = (config.emails || []).filter(Boolean);
  if (configuredEmails.length === 0) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: "Skipped: no popup follow-up windows configured",
      status: "skipped",
    });
    return logs;
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
  if (isDryRun) {
    logs.push({
      timestamp: new Date().toISOString(),
      automation: "Popup Follow Ups",
      property: "—",
      action: `═══ DRY RUN: Today is ${todayStr}. No popup follow-up emails will be sent. Validation: WHO would receive WHAT. ═══`,
      status: "info",
    });
  }

  logs.push({
    timestamp: new Date().toISOString(),
    automation: "Popup Follow Ups",
    property: "—",
    action: `Loaded ${contacts.length} popup contact(s) from SendGrid list`,
    status: "info",
  });

  for (const contact of contacts) {
    const email = String(contact?.email || "").trim().toLowerCase();
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

    const customFields = contact?.custom_fields || {};
    const rawTriggerDate = customFields[config.popupTriggeredFieldId];
    const triggerDate = parseCentralDateField(rawTriggerDate);

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
      parseSentTemplateIds(customFields[config.popupSentTemplatesFieldId])
    );
    const sentTemplatesLabel =
      Array.from(sentTemplateIds).join(",") || "(none)";
    const matchedEmails = configuredEmails.filter(
      (item) => item.daysAfterTrigger === daysSinceTriggered
    );

    if (matchedEmails.length === 0) {
      logs.push({
        timestamp: new Date().toISOString(),
        automation: "Popup Follow Ups",
        property: "—",
        action: `NO SEND ${email} | triggered ${triggerDate} | ${daysSinceTriggered} days since popup | no follow-up configured for today | sent: ${sentTemplatesLabel}`,
        status: "info",
      });
      continue;
    }

    for (const followup of matchedEmails) {
      const label = followup.label || `${followup.daysAfterTrigger}-day`;
      const templateId = String(followup.templateId || "").trim();

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
            to: email,
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

          sentTemplateIds.add(templateId);
          await updateContactCustomFields({
            email,
            customFields: {
              [config.popupTriggeredFieldId]: rawTriggerDate,
              [config.popupSentTemplatesFieldId]: stringifySentTemplateIds(
                Array.from(sentTemplateIds)
              ),
            },
          });
        }

        logs.push({
          timestamp: new Date().toISOString(),
          automation: "Popup Follow Ups",
          property: "—",
          action: isDryRun
            ? `[DRY RUN] Would send "${label}" to ${email} (${templateId}) | triggered ${triggerDate} | ${followup.daysAfterTrigger} days since popup | sent: ${sentTemplatesLabel}`
            : `Sent "${label}" to ${email} (${templateId}) | triggered ${triggerDate} | sent before update: ${sentTemplatesLabel}`,
          status: "success",
        });
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

  if (isDryRun) {
    const todayStr = today();
    console.log(`[cron] DRY RUN — no emails will be sent. Today: ${todayStr}. Validation: WHO would receive WHAT.`);
  }

  const allLogs = [];

  const vacancyLogs = await runVacancyEmails(automationConfig, isDryRun);
  allLogs.push(...vacancyLogs);

  const waiverLogs = await runWaiverReminders(automationConfig, isDryRun);
  allLogs.push(...waiverLogs);

  const popupLogs = await runPopupFollowups(automationConfig, isDryRun);
  allLogs.push(...popupLogs);

  await appendLogs(allLogs);

  const hasFailed = allLogs.some((log) => log.status === "failed");
  await fs.writeFile(
    LAST_RUN_PATH,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      status: hasFailed ? "FAILED" : "SUCCESS",
    })
  );

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
