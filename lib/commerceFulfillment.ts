import type Stripe from "stripe";
import {
  claimCommerceFulfillment,
  getCommercePurchase,
  getConfig,
  saveCommercePurchase,
} from "@/lib/kv";
import { sendBookingMessage } from "@/lib/lodgify";
import { sendPlainEmail } from "@/lib/sendgrid";
import { formatMoney, type CommercePurchase } from "@/lib/types";

const TEAM_PURCHASE_EMAIL = "contact@zenfulcove.com";
const FROM_NAME = "Zenfulcove Glamping";

const sendLodgifyBookingMessage = sendBookingMessage as (
  bookingId: string,
  options: {
    subject: string;
    message: string;
    type?: string;
    sendNotification?: boolean;
  }
) => Promise<unknown>;

type FulfillmentPatch = Partial<
  Pick<
    CommercePurchase,
    | "customer_confirmation_sent_at"
    | "team_notification_sent_at"
    | "lodgify_note_sent_at"
    | "fulfillment_error"
  >
>;

function clean(value: unknown) {
  return String(value || "").trim();
}

function paymentIntentId(session: Stripe.Checkout.Session) {
  const paymentIntent = session.payment_intent;
  return typeof paymentIntent === "string"
    ? paymentIntent
    : paymentIntent?.id ?? null;
}

function purchaseIdFromSession(session: Stripe.Checkout.Session) {
  return clean(session.metadata?.purchaseId || session.client_reference_id);
}

function firstNameOf(value: string | null | undefined) {
  const trimmed = clean(value);
  return trimmed ? trimmed.split(/\s+/)[0] : "there";
}

function orderLines(purchase: CommercePurchase) {
  return purchase.items.map(
    (item) =>
      `- ${item.quantity} x ${item.title} (${item.sku}) - ${formatMoney(
        item.amount_cents
      )}`
  );
}

function buildLodgifyNote(purchase: CommercePurchase) {
  return [
    "SPECIAL PACKAGE PURCHASE - PAID",
    "",
    `Purchase ID: ${purchase.id}`,
    `Reservation: ${purchase.reservation_id}`,
    `Guest: ${purchase.customer_name || "Guest"}`,
    purchase.stay_location ? `Cabin: ${purchase.stay_location}` : "",
    purchase.customer_email ? `Customer email: ${purchase.customer_email}` : "",
    purchase.customer_phone ? `Customer phone: ${purchase.customer_phone}` : "",
    "",
    "Items to set up:",
    ...orderLines(purchase),
    "",
    `Total paid: ${formatMoney(purchase.amount_cents)}`,
    purchase.stripe_checkout_session_id
      ? `Stripe checkout session: ${purchase.stripe_checkout_session_id}`
      : "",
    purchase.stripe_payment_intent_id
      ? `Stripe payment intent: ${purchase.stripe_payment_intent_id}`
      : "",
    "",
    "Action needed: set up all purchased items for this reservation.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function isPublicPurchase(purchase: CommercePurchase) {
  return purchase.channel === "public";
}

function buildCustomerEmail(purchase: CommercePurchase) {
  const isPublic = isPublicPurchase(purchase);
  return [
    `Hi ${firstNameOf(purchase.customer_name)},`,
    "",
    isPublic
      ? "We received your Zenfulcove special package purchase."
      : `We received your Zenfulcove special package purchase for reservation ${purchase.reservation_id}.`,
    "",
    "Order:",
    ...orderLines(purchase),
    "",
    `Total paid: ${formatMoney(purchase.amount_cents)}.`,
    "",
    isPublic
      ? "Our team has been notified and will reach out if we need any details to prepare your order."
      : "We added the request to your reservation details so our team can prepare it for your stay.",
    "",
    "Questions? Reply to this email or contact contact@zenfulcove.com.",
  ].join("\n");
}

function buildTeamEmail(
  purchase: CommercePurchase,
  lodgifyResult: { sent: boolean; reason?: string }
) {
  const isPublic = isPublicPurchase(purchase);
  return [
    isPublic
      ? "A customer paid for a Zenfulcove package/add-on through the public shop (no reservation)."
      : "A customer paid for a Zenfulcove special package/add-on.",
    "",
    isPublic
      ? "Reservation: none (public shop purchase)"
      : `Reservation: ${purchase.reservation_id}`,
    `Guest: ${purchase.customer_name || "Guest"}`,
    purchase.stay_location ? `Cabin: ${purchase.stay_location}` : "",
    purchase.customer_email ? `Customer email: ${purchase.customer_email}` : "",
    purchase.customer_phone ? `Customer phone: ${purchase.customer_phone}` : "",
    "",
    "Order:",
    ...orderLines(purchase),
    "",
    `Total paid: ${formatMoney(purchase.amount_cents)}`,
    isPublic
      ? ""
      : `Lodgify note: ${
          lodgifyResult.sent ? "added" : `not added (${lodgifyResult.reason || "unknown"})`
        }`,
    purchase.stripe_checkout_session_id
      ? `Stripe checkout session: ${purchase.stripe_checkout_session_id}`
      : "",
    purchase.stripe_payment_intent_id
      ? `Stripe payment intent: ${purchase.stripe_payment_intent_id}`
      : "",
    "",
    isPublic
      ? "This purchase is not tied to a reservation. Reach out to the customer to arrange the purchased items."
      : "Set up the listed purchased items for the guest reservation.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function uniqueEmails(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return values
    .map((value) => clean(value).toLowerCase())
    .filter((email) => {
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return true;
    });
}

async function patchPurchase(purchaseId: string, patch: FulfillmentPatch) {
  const latest = (await getCommercePurchase(purchaseId)) as CommercePurchase | null;
  if (!latest) return null;
  return (await saveCommercePurchase({
    ...latest,
    ...patch,
  })) as CommercePurchase;
}

function errorSummary(err: unknown) {
  return err instanceof Error ? err.message.slice(0, 500) : clean(err).slice(0, 500);
}

async function addLodgifySetupNote(purchase: CommercePurchase) {
  const latest = (await getCommercePurchase(purchase.id)) as CommercePurchase | null;
  if (!latest) return { sent: false, reason: "purchase missing" };
  if (isPublicPurchase(latest)) {
    return { sent: false, reason: "public purchase (no reservation)" };
  }
  if (latest.lodgify_note_sent_at) return { sent: true, reason: "already sent" };
  if (!latest.reservation_id) return { sent: false, reason: "missing reservation id" };

  try {
    await sendLodgifyBookingMessage(latest.reservation_id, {
      subject: "Paid special package purchase - setup needed",
      message: buildLodgifyNote(latest),
      type: "Owner",
      sendNotification: false,
    });
    await patchPurchase(latest.id, {
      lodgify_note_sent_at: new Date().toISOString(),
      fulfillment_error: null,
    });
    return { sent: true };
  } catch (err) {
    const message = `Lodgify note failed: ${errorSummary(err)}`;
    console.error(`Could not add Lodgify package purchase note ${latest.id}:`, err);
    await patchPurchase(latest.id, { fulfillment_error: message });
    return { sent: false, reason: message };
  }
}

async function sendCustomerConfirmation(purchase: CommercePurchase, from: { email: string; name: string }) {
  const latest = (await getCommercePurchase(purchase.id)) as CommercePurchase | null;
  if (!latest) return { sent: false, reason: "purchase missing" };
  if (latest.customer_confirmation_sent_at) {
    return { sent: true, reason: "already sent" };
  }
  if (!latest.customer_email) {
    return { sent: false, reason: "missing customer email" };
  }
  if (!from.email) return { sent: false, reason: "missing SendGrid sender" };

  try {
    await sendPlainEmail({
      to: latest.customer_email,
      from,
      subject: "Your Zenfulcove special package purchase is confirmed",
      text: buildCustomerEmail(latest),
    });
    await patchPurchase(latest.id, {
      customer_confirmation_sent_at: new Date().toISOString(),
      fulfillment_error: null,
    });
    return { sent: true };
  } catch (err) {
    const message = `Customer email failed: ${errorSummary(err)}`;
    console.error(`Could not email customer for package purchase ${latest.id}:`, err);
    await patchPurchase(latest.id, { fulfillment_error: message });
    return { sent: false, reason: message };
  }
}

async function sendTeamNotification(
  purchase: CommercePurchase,
  from: { email: string; name: string },
  lodgifyResult: { sent: boolean; reason?: string }
) {
  const latest = (await getCommercePurchase(purchase.id)) as CommercePurchase | null;
  if (!latest) return { sent: false, reason: "purchase missing" };
  if (latest.team_notification_sent_at) {
    return { sent: true, reason: "already sent" };
  }
  if (!from.email) return { sent: false, reason: "missing SendGrid sender" };

  const config = await getConfig();
  const configuredRecipients = Array.isArray(config?.messageNotifications?.recipients)
    ? config.messageNotifications.recipients
    : [];
  const recipients = uniqueEmails([TEAM_PURCHASE_EMAIL, ...configuredRecipients]);
  if (recipients.length === 0) return { sent: false, reason: "missing recipients" };

  try {
    await Promise.all(
      recipients.map((to) =>
        sendPlainEmail({
          to,
          from,
          subject: isPublicPurchase(latest)
            ? "[Zenfulcove Glamping] Paid package purchase (public shop)"
            : `[Zenfulcove Glamping] Paid package purchase for reservation ${latest.reservation_id}`,
          text: buildTeamEmail(latest, lodgifyResult),
        })
      )
    );
    await patchPurchase(latest.id, {
      team_notification_sent_at: new Date().toISOString(),
      fulfillment_error: null,
    });
    return { sent: true, recipients: recipients.length };
  } catch (err) {
    const message = `Team email failed: ${errorSummary(err)}`;
    console.error(`Could not email team for package purchase ${latest.id}:`, err);
    await patchPurchase(latest.id, { fulfillment_error: message });
    return { sent: false, reason: message };
  }
}

export async function fulfillCommercePurchase(purchase: CommercePurchase) {
  const config = await getConfig();
  const from = {
    email: clean(config?.sendgrid?.fromEmail || TEAM_PURCHASE_EMAIL),
    name: clean(config?.sendgrid?.fromName || FROM_NAME),
  };
  const lodgify = await addLodgifySetupNote(purchase);
  const customer = await sendCustomerConfirmation(purchase, from);
  const team = await sendTeamNotification(purchase, from, lodgify);
  return { lodgify, customer, team };
}

export async function confirmAndFulfillCommercePurchase(
  session: Stripe.Checkout.Session
) {
  const purchaseId = purchaseIdFromSession(session);
  if (!purchaseId || session.payment_status !== "paid") return null;

  const purchase = (await getCommercePurchase(purchaseId)) as CommercePurchase | null;
  if (!purchase) return null;

  const paidPurchase = (await saveCommercePurchase({
    ...purchase,
    status: "paid",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId(session),
    customer_name: purchase.customer_name || session.customer_details?.name || "",
    customer_email: session.customer_details?.email || purchase.customer_email,
    customer_phone: session.customer_details?.phone || purchase.customer_phone,
    updated_at: new Date().toISOString(),
  })) as CommercePurchase;

  // Persisting the paid status above is idempotent and safe to run from every
  // caller, but the notifications are not: this function runs from both the
  // Stripe webhook and the confirmation page, which can fire concurrently right
  // after payment. Single-flight the sends so only one caller fulfills; a later
  // retry re-claims after the lock TTL and completes anything left unsent.
  const claimed = await claimCommerceFulfillment(purchaseId);
  if (claimed) {
    await fulfillCommercePurchase(paidPurchase);
  }

  return ((await getCommercePurchase(purchaseId)) as CommercePurchase | null) || paidPurchase;
}
