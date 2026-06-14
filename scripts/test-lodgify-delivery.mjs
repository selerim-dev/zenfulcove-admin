#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  lodgifyRouteRequiredForContext,
  verifyLodgifyMessageDelivery,
} from "../lib/lodgify-message-delivery.js";

const booking = { id: "sample-booking", thread_guid: "thread-123" };
const context = {
  bookingId: "sample-booking",
  bookingSource: "BookingCom",
  bookingChannel: "Booking.com",
};
const subject = "Access Code for SKY CASTLE";
const message = "Greetings Sample,\n\nYour access code is 1234.";
const sentAt = Date.parse("2026-06-14T12:00:00.000Z");

function threadWithMessage(overrides = {}) {
  return {
    messages: [
      {
        id: "lodgify-message-1",
        message_id: "provider-message-1",
        subject,
        message,
        message_status: "Delivered",
        date_created: "2026-06-14T12:00:05.000Z",
        is_imported: false,
        ...overrides,
      },
    ],
  };
}

assert.equal(lodgifyRouteRequiredForContext(context), true);

const routed = await verifyLodgifyMessageDelivery({
  booking,
  context,
  subject,
  message,
  sentAt,
  getThread: async () => threadWithMessage({ route: "BookingCom" }),
});
assert.equal(routed.lodgifyDeliveryChecked, true);
assert.equal(routed.lodgifyRouteRequired, true);
assert.equal(routed.channelRouted, true);
assert.equal(routed.lodgifyDeliveryIssue, "");
assert.equal(routed.lodgifyMessageRoute, "BookingCom");

const unrouted = await verifyLodgifyMessageDelivery({
  booking,
  context,
  subject,
  message,
  sentAt,
  getThread: async () => threadWithMessage({ route: null }),
});
assert.equal(unrouted.lodgifyDeliveryChecked, true);
assert.equal(unrouted.lodgifyRouteRequired, true);
assert.equal(unrouted.channelRouted, false);
assert.equal(unrouted.lodgifyDeliveryIssue, "missing-channel-route");
assert.equal(unrouted.lodgifyMessageRoute, "");

const missingThread = await verifyLodgifyMessageDelivery({
  booking: { id: "sample-booking" },
  context,
  subject,
  message,
  sentAt,
  getThread: async () => {
    throw new Error("This should not be called without a thread GUID.");
  },
});
assert.equal(missingThread.lodgifyDeliveryChecked, false);
assert.equal(missingThread.channelRouted, false);
assert.equal(missingThread.lodgifyDeliveryIssue, "missing-thread-guid");

console.log("Lodgify delivery verification tests passed.");
