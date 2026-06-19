import { getConfig } from "@/lib/kv";
import { sendPlainEmail } from "@/lib/sendgrid";

function clean(value) {
  return String(value || "").trim();
}

function failureLines(logs = []) {
  return logs
    .filter((log) => log?.status === "failed")
    .slice(0, 20)
    .map((log, index) => {
      const parts = [
        `${index + 1}. ${clean(log.automation) || "Automation"}`,
        clean(log.property) && clean(log.property) !== "—"
          ? `Property: ${clean(log.property)}`
          : "",
        clean(log.bookingId) ? `Booking: ${clean(log.bookingId)}` : "",
        clean(log.action),
      ].filter(Boolean);
      return parts.join(" | ");
    });
}

/**
 * @param {{
 *   config?: Record<string, any>;
 *   title?: string;
 *   logs?: Array<Record<string, any>>;
 *   context?: Record<string, any>;
 * }} options
 */
export async function notifyAutomationFailure({
  config,
  title = "Zenfulcove automation failure",
  logs = [],
  context = {},
} = {}) {
  const automationConfig = config || (await getConfig());
  const notif = automationConfig?.messageNotifications || {};
  const recipients = Array.isArray(notif.recipients)
    ? notif.recipients.map(clean).filter(Boolean)
    : [];
  const from = {
    email: clean(automationConfig?.sendgrid?.fromEmail),
    name: clean(automationConfig?.sendgrid?.fromName) || "Zenfulcove Glamping",
  };
  const failedLines = failureLines(logs);

  if (notif.enabled === false || recipients.length === 0 || !from.email || failedLines.length === 0) {
    return {
      sent: false,
      skipped: true,
      recipients: recipients.length,
      reason:
        notif.enabled === false
          ? "notifications-disabled"
          : !from.email
            ? "missing-from-email"
            : failedLines.length === 0
              ? "no-failed-logs"
              : "missing-recipients",
    };
  }

  const subject = `[Zenfulcove Glamping] ${title}`;
  const contextLines = Object.entries(context || {})
    .map(([key, value]) => [clean(key), clean(value)])
    .filter(([key, value]) => key && value)
    .map(([key, value]) => `${key}: ${value}`);
  const text = [
    title,
    "",
    ...contextLines,
    ...(contextLines.length ? [""] : []),
    "Failed item(s):",
    ...failedLines,
    "",
    logs.length > failedLines.length
      ? `Showing first ${failedLines.length} failed item(s).`
      : "",
    "Check the admin automation logs for the full run details.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  await Promise.all(
    recipients.map((to) => sendPlainEmail({ to, subject, text, from }))
  );

  return {
    sent: true,
    recipients: recipients.length,
  };
}
