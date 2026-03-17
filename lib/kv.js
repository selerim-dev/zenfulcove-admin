import { Redis } from "@upstash/redis";
import { automationConfig as defaults } from "@/config/automations";

// Upstash Redis client — uses env vars set automatically by Vercel
// when you add an Upstash Redis integration from the Vercel Marketplace.
//
// Required env vars:
//   KV_REST_API_URL   (or UPSTASH_REDIS_REST_URL)
//   KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_TOKEN)

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token:
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CONFIG_KEY = "zenfulcove:config";

/**
 * Get the current automation config from KV.
 * If KV is empty (first run), seeds it with the defaults from config/automations.js.
 */
export async function getConfig() {
  let config = await redis.get(CONFIG_KEY);

  if (!config) {
    // First run — seed KV with defaults
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
      emails: config.popupFollowups?.emails || defaults.popupFollowups.emails,
    },
  };
}

/**
 * Save the automation config to KV.
 * @param {object} config
 */
export async function setConfig(config) {
  await redis.set(CONFIG_KEY, config);
}
