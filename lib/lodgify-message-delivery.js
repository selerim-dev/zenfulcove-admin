const DEFAULT_ROUTE_REQUIRED_SOURCES = [
  "Airbnb",
  "AirbnbIntegration",
  "BookingCom",
  "Booking.com",
];
const THREAD_POLL_DELAYS_MS = [0, 600, 1400];

async function defaultGetMessageThread(threadGuid) {
  const { getMessageThread } = await import("@/lib/lodgify");
  return getMessageThread(threadGuid);
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function configuredKeys(value, fallback = []) {
  const values = Array.isArray(value)
    ? value
    : clean(value)
      ? clean(value).split(",")
      : fallback;
  return values.map(normalizeKey).filter(Boolean);
}

function contextKeys(context = {}) {
  return [
    context.bookingSource,
    context.bookingChannel,
    context.bookingSourceText,
  ]
    .map(normalizeKey)
    .filter(Boolean);
}

function channelMatches(context = {}, keys = []) {
  const targets = new Set(keys);
  if (targets.size === 0) return false;
  return contextKeys(context).some((key) => targets.has(key));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toTimestamp(value) {
  if (!value) return 0;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function stripHtml(value) {
  return clean(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNonEmpty(values) {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return "";
}

export function findLodgifyThreadGuid(booking = {}) {
  return firstNonEmpty([
    booking.threadGuid,
    booking.thread_guid,
    booking.threadUid,
    booking.thread_uid,
    booking.messageThreadGuid,
    booking.message_thread_guid,
    booking.messageThreadUid,
    booking.message_thread_uid,
    booking.messagingThreadGuid,
    booking.messaging_thread_guid,
    booking.messagingThreadUid,
    booking.messaging_thread_uid,
    booking.conversationGuid,
    booking.conversation_guid,
    booking.conversationUid,
    booking.conversation_uid,
    booking.thread?.guid,
    booking.thread?.uid,
    booking.thread?.id,
    booking.messaging_thread?.guid,
    booking.messaging_thread?.uid,
    booking.messagingThread?.guid,
    booking.messagingThread?.uid,
    booking.conversation?.guid,
    booking.conversation?.uid,
    booking.conversation?.id,
  ]);
}

export function lodgifyRouteRequiredForContext(context = {}, config = {}) {
  const requiredSources = configuredKeys(
    config.lodgifyRouteRequiredSources,
    DEFAULT_ROUTE_REQUIRED_SOURCES
  );
  return channelMatches(context, requiredSources);
}

function expectedRouteForContext(context = {}) {
  if (
    channelMatches(context, configuredKeys(["Airbnb", "AirbnbIntegration"]))
  ) {
    return "Airbnb";
  }
  if (
    channelMatches(context, configuredKeys(["BookingCom", "Booking.com"]))
  ) {
    return "BookingCom";
  }
  return clean(context.bookingChannel);
}

function summarizeMessage(message = {}) {
  return {
    lodgifyMessageId: clean(message.id),
    lodgifyProviderMessageId: clean(message.message_id),
    lodgifyMessageStatus: clean(message.message_status || message.status),
    lodgifyMessageRoute: clean(message.route),
    lodgifyMessageImported: message.is_imported,
    lodgifyMessageCreatedAt: clean(
      message.date_created ||
        message.created_at ||
        message.createdAt ||
        message.sent_at ||
        message.date_sent
    ),
  };
}

function messageMatches({ candidate, subject, message, sentAt }) {
  const subjectMatches =
    !clean(subject) || clean(candidate.subject) === clean(subject);
  if (!subjectMatches) return false;

  const createdAt = toTimestamp(
    candidate.date_created ||
      candidate.created_at ||
      candidate.createdAt ||
      candidate.sent_at ||
      candidate.date_sent
  );
  if (sentAt && createdAt && createdAt < sentAt - 2 * 60 * 1000) return false;

  const expectedText = stripHtml(message);
  if (!expectedText) return true;

  const candidateText = stripHtml(candidate.message || candidate.body);
  const expectedNeedle = expectedText.slice(0, 80).toLowerCase();
  return (
    !expectedNeedle ||
    candidateText.toLowerCase().includes(expectedNeedle) ||
    expectedNeedle.includes(candidateText.slice(0, 80).toLowerCase())
  );
}

function findPostedMessage({ thread, subject, message, sentAt }) {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const candidates = messages
    .filter((candidate) =>
      messageMatches({ candidate, subject, message, sentAt })
    )
    .sort((a, b) => {
      const aTime = toTimestamp(a.date_created || a.created_at || a.sent_at);
      const bTime = toTimestamp(b.date_created || b.created_at || b.sent_at);
      return bTime - aTime;
    });

  return candidates[0] || null;
}

export async function verifyLodgifyMessageDelivery({
  booking,
  context = {},
  subject,
  message,
  sentAt = Date.now(),
  config = {},
  getThread = defaultGetMessageThread,
} = {}) {
  const routeRequired = lodgifyRouteRequiredForContext(context, config);
  const expectedRoute = expectedRouteForContext(context);
  const threadGuid = findLodgifyThreadGuid(booking);

  const base = {
    lodgifyDeliveryChecked: Boolean(threadGuid),
    lodgifyRouteRequired: routeRequired,
    lodgifyExpectedRoute: expectedRoute,
    lodgifyThreadGuidPresent: Boolean(threadGuid),
  };

  if (!threadGuid) {
    return {
      ...base,
      channelRouted: !routeRequired,
      lodgifyDeliveryIssue: routeRequired ? "missing-thread-guid" : "",
    };
  }

  let lastThread = null;
  for (const delay of THREAD_POLL_DELAYS_MS) {
    if (delay) await sleep(delay);
    lastThread = await getThread(threadGuid);
    const postedMessage = findPostedMessage({
      thread: lastThread,
      subject,
      message,
      sentAt,
    });
    if (postedMessage) {
      const summary = summarizeMessage(postedMessage);
      const routeMatches =
        !routeRequired ||
        normalizeKey(summary.lodgifyMessageRoute) === normalizeKey(expectedRoute);
      return {
        ...base,
        ...summary,
        lodgifyThreadErrorTitle: clean(lastThread?.error_title),
        lodgifyThreadErrorMessage: clean(lastThread?.error_message),
        channelRouted: routeMatches,
        lodgifyDeliveryIssue: routeMatches ? "" : "missing-channel-route",
      };
    }
  }

  return {
    ...base,
    lodgifyThreadErrorTitle: clean(lastThread?.error_title),
    lodgifyThreadErrorMessage: clean(lastThread?.error_message),
    channelRouted: !routeRequired,
    lodgifyDeliveryIssue: routeRequired ? "posted-message-not-found" : "",
  };
}
