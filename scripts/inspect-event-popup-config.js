#!/usr/bin/env node
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const cfg = await redis.get("zenfulcove:config");
const ep = cfg?.eventPopupSalesmateSms || {};
console.log("eventPopupSalesmateSms (raw from KV):");
console.log(JSON.stringify(ep, null, 2));
console.log("");
console.log("twilioFromNumber stored value:", JSON.stringify(ep.twilioFromNumber));
console.log("typeof:", typeof ep.twilioFromNumber);
if (typeof ep.twilioFromNumber === "string") {
  console.log("length:", ep.twilioFromNumber.length);
  console.log("char codes:", [...ep.twilioFromNumber].map((c) => c.charCodeAt(0)).join(","));
}
