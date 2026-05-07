import { Redis } from "@upstash/redis";
import { automationConfig as defaults } from "@/config/automations";

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token:
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CONFIG_KEY = "zenfulcove:config";
const EVENT_POPUP_CONTACT_KEY_PREFIX = "zenfulcove:event-popup:contact:";
const EVENT_POPUP_SMS_SENT_KEY_PREFIX = "zenfulcove:event-popup:sms-sent:";
const SALESMATE_FORM_SYNC_KEY_PREFIX = "zenfulcove:salesmate-form-sync:";

function normalizeLedgerKey(value) {
  return encodeURIComponent(String(value || "").trim().toLowerCase());
}

export async function getConfig() {
  let config = await redis.get(CONFIG_KEY);

  if (!config) {
    await redis.set(CONFIG_KEY, defaults);
    return defaults;
  }

  return {
    ...defaults,
    ...config,
    sendgrid: {
      ...defaults.sendgrid,
      ...config.sendgrid,
    },
    vacancyEmails: {
      ...defaults.vacancyEmails,
      ...config.vacancyEmails,
      windows: config.vacancyEmails?.windows || defaults.vacancyEmails.windows,
    },
    waiverReminders: {
      ...defaults.waiverReminders,
      ...config.waiverReminders,
      emails: config.waiverReminders?.emails || config.waiverReminders?.reminders || defaults.waiverReminders.emails,
    },
    popupFollowups: {
      ...defaults.popupFollowups,
      ...config.popupFollowups,
      testDestinations: {
        ...defaults.popupFollowups.testDestinations,
        ...config.popupFollowups?.testDestinations,
      },
      emails: config.popupFollowups?.emails || defaults.popupFollowups.emails,
      sms: config.popupFollowups?.sms || defaults.popupFollowups.sms,
    },
    eventPopupSalesmateSms: {
      ...defaults.eventPopupSalesmateSms,
      ...config.eventPopupSalesmateSms,
      testDestinations: {
        ...defaults.eventPopupSalesmateSms.testDestinations,
        ...config.eventPopupSalesmateSms?.testDestinations,
      },
      sms: config.eventPopupSalesmateSms?.sms || defaults.eventPopupSalesmateSms.sms,
    },
    jotformClientSync: {
      ...defaults.jotformClientSync,
      ...config.jotformClientSync,
      jotformFormIds: config.jotformClientSync?.jotformFormIds || defaults.jotformClientSync.jotformFormIds,
    },
    lodgifyClientSync: {
      ...defaults.lodgifyClientSync,
      ...config.lodgifyClientSync,
    },
    salesmateFormSync: {
      ...defaults.salesmateFormSync,
      ...config.salesmateFormSync,
    },
  };
}

export async function setConfig(config) {
  await redis.set(CONFIG_KEY, config);
}

export async function getEventPopupContactState(contactKey) {
  const key = normalizeLedgerKey(contactKey);
  if (!key) return null;
  return redis.get(`${EVENT_POPUP_CONTACT_KEY_PREFIX}${key}`);
}

export async function setEventPopupContactState(contactKey, state) {
  const key = normalizeLedgerKey(contactKey);
  if (!key) return;
  await redis.set(`${EVENT_POPUP_CONTACT_KEY_PREFIX}${key}`, state);
}

export async function getEventPopupSmsSent(contactKey, followupId) {
  const normalizedContactKey = normalizeLedgerKey(contactKey);
  const normalizedFollowupId = normalizeLedgerKey(followupId);
  if (!normalizedContactKey || !normalizedFollowupId) return null;
  return redis.get(`${EVENT_POPUP_SMS_SENT_KEY_PREFIX}${normalizedContactKey}:${normalizedFollowupId}`);
}

export async function setEventPopupSmsSent(contactKey, followupId, state) {
  const normalizedContactKey = normalizeLedgerKey(contactKey);
  const normalizedFollowupId = normalizeLedgerKey(followupId);
  if (!normalizedContactKey || !normalizedFollowupId) return;
  await redis.set(`${EVENT_POPUP_SMS_SENT_KEY_PREFIX}${normalizedContactKey}:${normalizedFollowupId}`, state);
}

export async function getSalesmateFormSyncState(listId, contactKey) {
  const normalizedListId = normalizeLedgerKey(listId);
  const normalizedContactKey = normalizeLedgerKey(contactKey);
  if (!normalizedListId || !normalizedContactKey) return null;
  return redis.get(`${SALESMATE_FORM_SYNC_KEY_PREFIX}${normalizedListId}:${normalizedContactKey}`);
}

export async function setSalesmateFormSyncState(listId, contactKey, state) {
  const normalizedListId = normalizeLedgerKey(listId);
  const normalizedContactKey = normalizeLedgerKey(contactKey);
  if (!normalizedListId || !normalizedContactKey) return;
  await redis.set(`${SALESMATE_FORM_SYNC_KEY_PREFIX}${normalizedListId}:${normalizedContactKey}`, state);
}
