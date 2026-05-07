import { sendSms, validateTwilioConfig } from "@/lib/twilio";
import {
  getContactsFromListDetailed,
  getContactByEmailDetailed,
  sendTemplateEmail,
} from "@/lib/sendgrid";
import { PROMOTION_CONTACT_LISTS } from "@/lib/promotion-lists";

const PROMOTION_NAME = "One-Off Promotions";
const MAX_PREVIEW_LOGS = 50;

function nowLog(action, status = "info") {
  return {
    timestamp: new Date().toISOString(),
    automation: PROMOTION_NAME,
    property: "—",
    action,
    status,
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizePhoneNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return "+1" + cleaned;
  return cleaned;
}

function normalizeChannel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["email", "sms", "both"].includes(normalized) ? normalized : "email";
}

function normalizeMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["dryrun", "dry-run", "dry_run"].includes(normalized)
    ? "dryRun"
    : ["test", "send"].includes(normalized)
      ? normalized
      : "dryRun";
}

function getListDefinitions() {
  const definitions = {};
  PROMOTION_CONTACT_LISTS.forEach((list) => {
    definitions[list.key] = list;
  });

  // Backwards-compatible aliases for any older client payloads.
  definitions.customers = PROMOTION_CONTACT_LISTS.find(
    (list) => list.key === "lodgify-booked-guests"
  );
  definitions.prospects = PROMOTION_CONTACT_LISTS.find(
    (list) => list.key === "all-clients"
  );

  return definitions;
}

function dedupeContactsByEmail(contacts) {
  const byEmail = new Map();

  contacts.forEach((contact) => {
    const email = normalizeEmail(contact?.email);
    if (!email) return;

    const existing = byEmail.get(email) || {};
    byEmail.set(email, {
      ...existing,
      ...contact,
      email,
      first_name: existing.first_name || contact?.first_name || "",
      last_name: existing.last_name || contact?.last_name || "",
      phone_number:
        normalizePhoneNumber(existing.phone_number || existing.phone || "") ||
        normalizePhoneNumber(contact?.phone_number || contact?.phone || ""),
      _segments: Array.from(
        new Set([...(existing._segments || []), ...(contact._segments || [])])
      ),
    });
  });

  return Array.from(byEmail.values());
}

function getRecipientName(contact) {
  return [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim();
}

function resolveListEntry(rawValue, definitions) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return null;

  const keyMatch = definitions[trimmed.toLowerCase()];
  if (keyMatch) {
    return { listId: keyMatch.listId, label: keyMatch.label };
  }

  return { listId: trimmed, label: `SendGrid list ${trimmed}` };
}

async function resolveRecipients({ selectedLists, logs }) {
  const definitions = getListDefinitions();
  const selected = (selectedLists || [])
    .map((item) => resolveListEntry(item, definitions))
    .filter(Boolean);

  if (selected.length === 0) {
    logs.push(nowLog("Skipped: no promotion contact list selected", "skipped"));
    return [];
  }

  const allContacts = [];
  const loadedListIds = new Set();

  for (const list of selected) {
    if (loadedListIds.has(list.listId)) {
      logs.push(
        nowLog(
          `Using already-loaded SendGrid list ${list.listId} for ${list.label}`,
          "info"
        )
      );
      continue;
    }

    try {
      const contacts = await getContactsFromListDetailed(list.listId);
      loadedListIds.add(list.listId);
      allContacts.push(
        ...contacts.map((contact) => ({
          ...contact,
          _segments: [list.label],
        }))
      );
      logs.push(
        nowLog(
          `Loaded ${contacts.length} contact(s) from ${list.label} (${list.listId})`,
          "info"
        )
      );
    } catch (err) {
      logs.push(
        nowLog(
          `Failed to fetch ${list.label} (${list.listId}): ${err.message}`,
          "failed"
        )
      );
    }
  }

  return dedupeContactsByEmail(allContacts);
}

function summarizeRecipients({ recipients, shouldSendEmail, shouldSendSms, logs }) {
  const emailEligible = recipients.filter((contact) => normalizeEmail(contact.email));
  const smsEligible = recipients.filter((contact) =>
    normalizePhoneNumber(contact.phone_number || contact.phone || "")
  );

  logs.push(
    nowLog(
      `Prepared ${recipients.length} unique recipient(s) | email-ready: ${emailEligible.length} | SMS-ready: ${smsEligible.length}`,
      "info"
    )
  );

  if (shouldSendEmail && emailEligible.length === 0) {
    logs.push(nowLog("No recipients have email addresses for this promotion", "skipped"));
  }

  if (shouldSendSms && smsEligible.length === 0) {
    logs.push(nowLog("No recipients have phone numbers for this promotion", "skipped"));
  }

  return { emailEligible, smsEligible };
}

async function hydrateMissingPhonesForSms(recipients, logs) {
  const hydrationCache = new Map();
  let hydratedCount = 0;
  let failedCount = 0;

  logs.push(
    nowLog(
      "Checking contacts without list-level phone numbers using direct SendGrid contact lookup",
      "info"
    )
  );

  for (const contact of recipients) {
    const email = normalizeEmail(contact.email);
    const existingPhone = normalizePhoneNumber(contact.phone_number || contact.phone || "");
    if (!email || existingPhone) continue;

    try {
      let hydrated = hydrationCache.get(email);
      if (hydrated === undefined) {
        hydrated = await getContactByEmailDetailed(email);
        hydrationCache.set(email, hydrated || null);
      }

      const hydratedPhone = normalizePhoneNumber(
        hydrated?.phone_number || hydrated?.phone || ""
      );
      if (hydratedPhone) {
        contact.phone_number = hydratedPhone;
        hydratedCount += 1;
        logs.push(
          nowLog(
            `Hydrated missing phone for ${email} via direct SendGrid contact lookup`,
            "info"
          )
        );
      }
    } catch (err) {
      failedCount += 1;
      logs.push(
        nowLog(`Failed to hydrate phone for ${email}: ${err.message}`, "failed")
      );
    }
  }

  logs.push(
    nowLog(
      `Phone hydration complete | hydrated: ${hydratedCount} | failed lookups: ${failedCount}`,
      failedCount > 0 ? "failed" : "info"
    )
  );
}

function validatePromotionInput({
  mode,
  channel,
  templateId,
  smsBody,
  testDestinations,
  logs,
}) {
  const shouldSendEmail = channel === "email" || channel === "both";
  const shouldSendSms = channel === "sms" || channel === "both";

  if (shouldSendEmail && !String(templateId || "").trim()) {
    logs.push(nowLog("Skipped: email template ID is required", "skipped"));
    return false;
  }

  if (shouldSendSms && !String(smsBody || "").trim()) {
    logs.push(nowLog("Skipped: SMS message body is required", "skipped"));
    return false;
  }

  if (mode === "test" && shouldSendEmail && !String(testDestinations?.email || "").trim()) {
    logs.push(nowLog("Skipped: test email destination is required", "skipped"));
    return false;
  }

  if (mode === "test" && shouldSendSms && !String(testDestinations?.sms || "").trim()) {
    logs.push(nowLog("Skipped: test SMS destination is required", "skipped"));
    return false;
  }

  if ((mode === "test" || mode === "send") && shouldSendSms) {
    try {
      validateTwilioConfig();
    } catch (err) {
      logs.push(nowLog(`Skipped: ${err.message}`, "skipped"));
      return false;
    }
  }

  return true;
}

function logDryRunPreview({ recipients, shouldSendEmail, shouldSendSms, logs }) {
  const preview = recipients.slice(0, MAX_PREVIEW_LOGS);
  preview.forEach((contact) => {
    const email = normalizeEmail(contact.email) || "(no email)";
    const phone = normalizePhoneNumber(contact.phone_number || contact.phone || "") || "(no phone)";
    const channels = [
      shouldSendEmail && normalizeEmail(contact.email) ? "email" : "",
      shouldSendSms && phone !== "(no phone)" ? "sms" : "",
    ].filter(Boolean);
    logs.push(
      nowLog(
        `[DRY RUN] ${email} | ${phone} | ${channels.join("+") || "no eligible channel"} | ${getRecipientName(contact) || "(no name)"}`,
        channels.length > 0 ? "success" : "skipped"
      )
    );
  });

  if (recipients.length > MAX_PREVIEW_LOGS) {
    logs.push(
      nowLog(
        `[DRY RUN] Preview limited to ${MAX_PREVIEW_LOGS} recipient(s); ${recipients.length - MAX_PREVIEW_LOGS} additional recipient(s) omitted from log detail`,
        "info"
      )
    );
  }
}

export async function runOneOffPromotion({
  config,
  mode: rawMode,
  segments,
  lists,
  channel: rawChannel,
  templateId,
  smsBody,
  testDestinations,
}) {
  const mode = normalizeMode(rawMode);
  const channel = normalizeChannel(rawChannel);
  const shouldSendEmail = channel === "email" || channel === "both";
  const shouldSendSms = channel === "sms" || channel === "both";
  const logs = [
    nowLog(
      `${mode === "dryRun" ? "Dry run" : mode === "test" ? "Test send" : "Live send"} requested for ${channel}`,
      "info"
    ),
  ];
  const selectedLists = Array.isArray(lists) && lists.length > 0 ? lists : segments;

  if (
    !validatePromotionInput({
      mode,
      channel,
      templateId,
      smsBody,
      testDestinations,
      logs,
    })
  ) {
    return logs;
  }

  const recipients = await resolveRecipients({
    selectedLists,
    logs,
  });

  if (recipients.length === 0) {
    logs.push(nowLog("No eligible SendGrid contacts found for selected segments", "skipped"));
    return logs;
  }

  if (shouldSendSms) {
    await hydrateMissingPhonesForSms(recipients, logs);
  }

  const { emailEligible, smsEligible } = summarizeRecipients({
    recipients,
    shouldSendEmail,
    shouldSendSms,
    logs,
  });

  if (mode === "dryRun") {
    logs.push(nowLog("═══ DRY RUN: No promotion messages were sent. ═══", "info"));
    logDryRunPreview({ recipients, shouldSendEmail, shouldSendSms, logs });
    return logs;
  }

  const emailRecipients = mode === "test" ? emailEligible.slice(0, 1) : emailEligible;
  const smsRecipients = mode === "test" ? smsEligible.slice(0, 1) : smsEligible;
  const from = {
    email: config?.sendgrid?.fromEmail,
    name: config?.sendgrid?.fromName,
  };
  let sentCount = 0;
  let failedCount = 0;

  if (shouldSendEmail) {
    const trimmedTemplateId = String(templateId || "").trim();
    for (const contact of emailRecipients) {
      const originalEmail = normalizeEmail(contact.email);
      const to = mode === "test" ? String(testDestinations.email || "").trim() : originalEmail;
      try {
        await sendTemplateEmail({
          to,
          from,
          templateId: trimmedTemplateId,
          data: {
            first_name: contact?.first_name || contact?.firstName || "",
            last_name: contact?.last_name || contact?.lastName || "",
            full_name: getRecipientName(contact),
            email: originalEmail,
          },
        });
        sentCount += 1;
        logs.push(
          nowLog(
            mode === "test"
              ? `[TEST SEND] Routed email originally for ${originalEmail} to ${to} | template: ${trimmedTemplateId}`
              : `Sent email promotion to ${originalEmail} | template: ${trimmedTemplateId}`,
            "success"
          )
        );
      } catch (err) {
        failedCount += 1;
        const detail = err.response?.body?.errors?.[0]?.message || err.message;
        logs.push(nowLog(`Failed email promotion for ${originalEmail}: ${detail}`, "failed"));
      }
    }
  }

  if (shouldSendSms) {
    for (const contact of smsRecipients) {
      const originalPhone = normalizePhoneNumber(contact.phone_number || contact.phone || "");
      const to =
        mode === "test"
          ? normalizePhoneNumber(testDestinations.sms || "")
          : originalPhone;
      try {
        const smsResult = await sendSms({
          to,
          body: smsBody,
        });
        sentCount += 1;
        const sidSuffix = smsResult?.sid ? ` | sid: ${smsResult.sid}` : "";
        logs.push(
          nowLog(
            mode === "test"
              ? `[TEST SEND] Routed SMS originally for ${originalPhone} to ${to}${sidSuffix}`
              : `Sent SMS promotion to ${originalPhone}${sidSuffix}`,
            "success"
          )
        );
      } catch (err) {
        failedCount += 1;
        logs.push(nowLog(`Failed SMS promotion for ${originalPhone}: ${err.message}`, "failed"));
      }
    }
  }

  logs.push(
    nowLog(
      `${mode === "test" ? "Test send" : "Live send"} complete | sent: ${sentCount} | failed: ${failedCount}`,
      failedCount > 0 ? "failed" : "success"
    )
  );

  return logs;
}
