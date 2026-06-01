import { Redis } from "@upstash/redis";
import { automationConfig as defaults } from "@/config/automations";

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token:
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CONFIG_KEY = "zenfulcove:config";
const COMPANY_DISPLAY_NAME = "Zenfulcove Glamping";
const DEFAULT_GOOGLE_MAPS_ADDRESS = "103 potato smith rd, unit c, elgin texas 78621";
const DEFAULT_GOOGLE_MAPS_URL = "https://maps.app.goo.gl/QowaHLFH3anBavuv6?g_st=ic";
const EVENT_POPUP_CONTACT_KEY_PREFIX = "zenfulcove:event-popup:contact:";
const EVENT_POPUP_SMS_SENT_KEY_PREFIX = "zenfulcove:event-popup:sms-sent:";
const SALESMATE_FORM_SYNC_KEY_PREFIX = "zenfulcove:salesmate-form-sync:";
const SMS_MESSAGES_KEY_PREFIX = "zenfulcove:sms:msgs:";
const SMS_THREAD_INDEX_KEY_PREFIX = "zenfulcove:sms:idx:";
const SMS_THREAD_META_KEY_PREFIX = "zenfulcove:sms:meta:";
const SMS_SEEN_KEY_PREFIX = "zenfulcove:sms:seen:";
const SMS_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

function normalizeLedgerKey(value) {
  return encodeURIComponent(String(value || "").trim().toLowerCase());
}

function normalizePropertyMessageData(map = {}) {
  if (!map || typeof map !== "object" || Array.isArray(map)) return {};
  const next = {};
  for (const [key, value] of Object.entries(map)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      next[key] = value;
      continue;
    }
    const entry = { ...value };
    const address = String(entry.address || "").trim();
    if (
      !address ||
      /103\s+potato\s+smith/i.test(address)
    ) {
      entry.address = DEFAULT_GOOGLE_MAPS_ADDRESS;
    }
    if (!String(entry.googleMapsAddress || "").trim()) {
      entry.googleMapsAddress = DEFAULT_GOOGLE_MAPS_ADDRESS;
    }
    if (!String(entry.googleMapsUrl || entry.googleMapsURL || "").trim()) {
      entry.googleMapsUrl = DEFAULT_GOOGLE_MAPS_URL;
    }
    next[key] = entry;
  }
  return next;
}

function mergeNamedSectionDefaults(defaultSections = {}, configuredSections = {}) {
  const sections =
    configuredSections && typeof configuredSections === "object" && !Array.isArray(configuredSections)
      ? configuredSections
      : {};
  const keys = new Set([
    ...Object.keys(defaultSections || {}),
    ...Object.keys(sections || {}),
  ]);

  return Array.from(keys).reduce((merged, key) => {
    const defaultValue =
      defaultSections?.[key] &&
      typeof defaultSections[key] === "object" &&
      !Array.isArray(defaultSections[key])
        ? defaultSections[key]
        : {};
    const configuredValue =
      sections?.[key] &&
      typeof sections[key] === "object" &&
      !Array.isArray(sections[key])
        ? sections[key]
        : {};
    merged[key] = {
      ...defaultValue,
      ...configuredValue,
    };
    return merged;
  }, {});
}

function smsKeyFor(twilioNumber, contactPhone) {
  return `${normalizeLedgerKey(twilioNumber)}:${normalizeLedgerKey(contactPhone)}`;
}

export async function appendSmsMessage({ twilioNumber, contactPhone, message, suppressUnread = false }) {
  if (!twilioNumber || !contactPhone || !message) return;
  const composite = smsKeyFor(twilioNumber, contactPhone);
  const messagesKey = `${SMS_MESSAGES_KEY_PREFIX}${composite}`;
  const indexKey = `${SMS_THREAD_INDEX_KEY_PREFIX}${normalizeLedgerKey(twilioNumber)}`;
  const metaKey = `${SMS_THREAD_META_KEY_PREFIX}${composite}`;
  const seenKey = `${SMS_SEEN_KEY_PREFIX}${composite}`;

  const sid = String(message.sid || message.id || "").trim();
  if (sid) {
    const added = await redis.sadd(seenKey, sid);
    if (added === 0) return;
  }

  const ts = Number(message.timestamp) || Date.now();
  const score = ts;
  const member = JSON.stringify({ ...message, timestamp: ts });

  const cutoff = Date.now() - SMS_RETENTION_MS;

  await Promise.all([
    redis.zadd(messagesKey, { score, member }),
    redis.zremrangebyscore(messagesKey, 0, cutoff),
    redis.zadd(indexKey, { score, member: String(contactPhone) }),
  ]);

  const existingMeta = (await redis.get(metaKey)) || {};
  const isNewerThanExisting = ts >= (existingMeta.lastMessageAt || 0);
  const shouldBumpUnread = !suppressUnread && message.direction === "in";
  const incomingUnread = shouldBumpUnread
    ? (existingMeta.unreadCount || 0) + 1
    : existingMeta.unreadCount || 0;

  const meta = isNewerThanExisting
    ? {
        twilioNumber: String(twilioNumber),
        contactPhone: String(contactPhone),
        lastMessageAt: ts,
        lastMessagePreview: String(message.body || "").slice(0, 140),
        lastMessageDirection: message.direction || "in",
        unreadCount: incomingUnread,
      }
    : { ...existingMeta, unreadCount: incomingUnread };

  await redis.set(metaKey, meta);
}

export async function listSmsThreads(twilioNumber, { limit = 100 } = {}) {
  if (!twilioNumber) return [];
  const indexKey = `${SMS_THREAD_INDEX_KEY_PREFIX}${normalizeLedgerKey(twilioNumber)}`;
  const phones = await redis.zrange(indexKey, 0, Math.max(0, limit - 1), { rev: true });
  if (!phones?.length) return [];

  const metaKeys = phones.map(
    (phone) => `${SMS_THREAD_META_KEY_PREFIX}${smsKeyFor(twilioNumber, phone)}`
  );
  const metas = await Promise.all(metaKeys.map((key) => redis.get(key)));
  return metas
    .map((meta, i) => meta || { twilioNumber, contactPhone: phones[i], lastMessageAt: 0, lastMessagePreview: "", unreadCount: 0 })
    .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
}

export async function listSmsMessages({ twilioNumber, contactPhone, limit = 200 }) {
  if (!twilioNumber || !contactPhone) return [];
  const messagesKey = `${SMS_MESSAGES_KEY_PREFIX}${smsKeyFor(twilioNumber, contactPhone)}`;
  const raw = await redis.zrange(messagesKey, -limit, -1);
  return (raw || []).map((entry) => {
    if (typeof entry === "string") {
      try {
        return JSON.parse(entry);
      } catch {
        return null;
      }
    }
    return entry;
  }).filter(Boolean);
}

async function scanAndDelete(pattern) {
  let cursor = "0";
  let total = 0;
  do {
    const result = await redis.scan(cursor, { match: pattern, count: 500 });
    cursor = String(result[0]);
    const keys = result[1] || [];
    if (keys.length) {
      await redis.del(...keys);
      total += keys.length;
    }
  } while (cursor !== "0");
  return total;
}

export async function clearAllSmsData(twilioNumber) {
  const numberSuffix = twilioNumber ? `${normalizeLedgerKey(twilioNumber)}*` : "*";
  const messagePattern = `${SMS_MESSAGES_KEY_PREFIX}${numberSuffix}`;
  const metaPattern = `${SMS_THREAD_META_KEY_PREFIX}${numberSuffix}`;
  const seenPattern = `${SMS_SEEN_KEY_PREFIX}${numberSuffix}`;

  const [msgsDeleted, metaDeleted] = await Promise.all([
    scanAndDelete(messagePattern),
    scanAndDelete(metaPattern),
    scanAndDelete(seenPattern),
  ]);

  let indexDeleted = 0;
  if (twilioNumber) {
    const indexKey = `${SMS_THREAD_INDEX_KEY_PREFIX}${normalizeLedgerKey(twilioNumber)}`;
    indexDeleted = (await redis.del(indexKey)) || 0;
  } else {
    indexDeleted = await scanAndDelete(`${SMS_THREAD_INDEX_KEY_PREFIX}*`);
  }

  return { messagesCleared: msgsDeleted, metaCleared: metaDeleted, indexCleared: indexDeleted };
}

export async function markSmsThreadRead({ twilioNumber, contactPhone }) {
  if (!twilioNumber || !contactPhone) return;
  const metaKey = `${SMS_THREAD_META_KEY_PREFIX}${smsKeyFor(twilioNumber, contactPhone)}`;
  const meta = (await redis.get(metaKey)) || {};
  await redis.set(metaKey, { ...meta, twilioNumber, contactPhone, unreadCount: 0 });
}

export async function getConfig() {
  let config = await redis.get(CONFIG_KEY);

  if (!config) {
    await redis.set(CONFIG_KEY, defaults);
    return defaults;
  }

  const accessCodeRelease = {
    ...defaults.accessCodeRelease,
    ...config.accessCodeRelease,
    propertyIds: config.accessCodeRelease?.propertyIds || defaults.accessCodeRelease.propertyIds,
    propertyCodes: {
      ...defaults.accessCodeRelease?.propertyCodes,
      ...config.accessCodeRelease?.propertyCodes,
    },
    jervisPropertyIds: {
      ...defaults.accessCodeRelease?.jervisPropertyIds,
      ...config.accessCodeRelease?.jervisPropertyIds,
    },
    propertyMessageData: {
      ...defaults.accessCodeRelease?.propertyMessageData,
      ...config.accessCodeRelease?.propertyMessageData,
    },
  };
  accessCodeRelease.propertyMessageData = normalizePropertyMessageData(
    accessCodeRelease.propertyMessageData
  );

  if (
    Number(config.accessCodeRelease?.waiverLodgifyScheduleVersion || 0) < 2
  ) {
    accessCodeRelease.waiverLodgifyScheduleVersion = 2;
    if (Number(accessCodeRelease.releaseHourCentral) === 11) {
      accessCodeRelease.releaseHourCentral =
        defaults.accessCodeRelease.releaseHourCentral;
    }
  }

  const sendgrid = {
    ...defaults.sendgrid,
    ...config.sendgrid,
  };
  if (String(sendgrid.fromName || "").trim() === "Zenfulcove") {
    sendgrid.fromName = COMPANY_DISPLAY_NAME;
  }

  const messageNotifications = {
    ...defaults.messageNotifications,
    ...config.messageNotifications,
  };
  if (String(messageNotifications.subjectPrefix || "").trim() === "[Zenfulcove SMS]") {
    messageNotifications.subjectPrefix = "[Zenfulcove Glamping SMS]";
  }

  return {
    ...defaults,
    ...config,
    sendgrid,
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
    accessCodeRelease,
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
    localFormClientSync: {
      ...defaults.localFormClientSync,
      ...config.localFormClientSync,
      formSlugs: config.localFormClientSync?.formSlugs || defaults.localFormClientSync.formSlugs,
    },
    jotformLocalFormImport: {
      ...defaults.jotformLocalFormImport,
      ...config.jotformLocalFormImport,
      mappings: config.jotformLocalFormImport?.mappings || defaults.jotformLocalFormImport.mappings,
    },
    lodgifyClientSync: {
      ...defaults.lodgifyClientSync,
      ...config.lodgifyClientSync,
    },
    salesmateFormSync: {
      ...defaults.salesmateFormSync,
      ...config.salesmateFormSync,
    },
    messageNotifications,
    customerPortal: {
      ...defaults.customerPortal,
      ...config.customerPortal,
      navigation: {
        ...defaults.customerPortal?.navigation,
        ...config.customerPortal?.navigation,
      },
      myStaySections: mergeNamedSectionDefaults(
        defaults.customerPortal?.myStaySections,
        config.customerPortal?.myStaySections
      ),
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
