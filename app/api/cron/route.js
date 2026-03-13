import { NextResponse } from "next/server";
import { CRON_SECRET } from "@/config/keys";
import { getConfig } from "@/lib/kv";
import { getProperties, getAvailability, getBookings } from "@/lib/lodgify";
import { getFormSubmissions, bookingHasWaiver } from "@/lib/jotform";
import { sendTemplateEmail, getContactsFromList } from "@/lib/sendgrid";
import fs from "fs/promises";
import path from "path";

const LOGS_PATH = path.join(process.cwd(), "logs", "activity.json");
const LAST_RUN_PATH = path.join(process.cwd(), "logs", "last-run.json");
const DRY_RUN_ENV = process.env.CRON_DRY_RUN === "true";

function today() {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
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

// ─── Automation 2: Jotform Waiver Emails (1 original + 3 reminders) ───────────
// All 4 emails use the same Jotform form. Sent only if guest hasn't submitted yet.
// Runs daily at 8 AM CST — template IDs, jotformFormId editable from dashboard.

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

  const reminders = config.emails || config.reminders || [];
  const todayStr = today();
  const waiverUrl = `https://form.jotform.com/${jotformFormId}`;

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
        const arrivalStr = typeof arrival === "string" ? arrival.slice(0, 10) : "";
        return arrivalStr === targetDateStr;
      });

      // Optional: restrict to specific property IDs (e.g. Zenfulcove only)
      const propertyIds = config.propertyIds;
      if (Array.isArray(propertyIds) && propertyIds.length > 0) {
        bookings = bookings.filter(
          (b) => propertyIds.includes(String(b.property_id ?? b.propertyId ?? ""))
        );
      }

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
