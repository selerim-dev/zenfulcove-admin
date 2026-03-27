import { Redis } from "@upstash/redis";
import { automationConfig as defaults } from "@/config/automations";

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token:
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CONFIG_KEY = "zenfulcove:config";

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
    jotformClientSync: {
      ...defaults.jotformClientSync,
      ...config.jotformClientSync,
      jotformFormIds: config.jotformClientSync?.jotformFormIds || defaults.jotformClientSync.jotformFormIds,
    },
    lodgifyClientSync: {
      ...defaults.lodgifyClientSync,
      ...config.lodgifyClientSync,
    },
  };
}

export async function setConfig(config) {
  await redis.set(CONFIG_KEY, config);
}
