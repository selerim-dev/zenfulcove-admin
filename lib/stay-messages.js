import { signStayMessageAttachments } from "@/lib/stay-message-attachments";

function clean(value) {
  return String(value || "").trim();
}

function firstNonEmpty(values) {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return "";
}

function toTimestamp(value) {
  if (!value) return Date.now();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
}

function stripHtml(value) {
  return clean(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function inferDirection(message = {}) {
  const type = lower(message.type || message.message_type || message.sender_type);
  const direction = lower(message.direction);
  const from = lower(message.from || message.sender || message.sender_name || message.author);
  const isOwner = Boolean(message.is_owner || message.from_owner || message.owner);
  const isGuest = Boolean(message.is_guest || message.from_guest || message.guest);

  if (direction.includes("guest") || direction === "in" || direction === "inbound") return "guest";
  if (direction.includes("owner") || direction === "out" || direction === "outbound") return "host";
  if (
    type.includes("guest") ||
    type.includes("renter") ||
    type.includes("customer") ||
    type.includes("traveler") ||
    isGuest
  ) return "guest";
  if (type.includes("owner") || type.includes("host") || isOwner) return "host";
  if (from.includes("guest")) return "guest";
  if (from.includes("zenful") || from.includes("owner") || from.includes("host")) return "host";
  return "host";
}

function normalizeAttachment(attachment = {}) {
  const fileName = firstNonEmpty([
    attachment.fileName,
    attachment.file_name,
    attachment.name,
    attachment.filename,
    attachment.title,
  ]);
  const url = firstNonEmpty([
    attachment.signedUrl,
    attachment.signed_url,
    attachment.url,
    attachment.href,
    attachment.downloadUrl,
    attachment.download_url,
  ]);
  return {
    ...attachment,
    fileName: fileName || "Attachment",
    signedUrl: url,
    url,
  };
}

export function normalizeStayMessage(message = {}, { source = "local", bookingId = "" } = {}) {
  const body = stripHtml(
    firstNonEmpty([
      message.body,
      message.message,
      message.text,
      message.content,
      message.html,
      message.description,
    ])
  );
  const timestamp = Number(message.timestamp) || toTimestamp(
    firstNonEmpty([
      message.created_at,
      message.createdAt,
      message.date_created,
      message.dateCreated,
      message.sent_at,
      message.sentAt,
      message.date_sent,
      message.dateSent,
      message.date,
      message.time,
    ])
  );
  const id =
    clean(message.id || message.guid || message.message_id || message.messageId || message.sid) ||
    `${source}_${timestamp}_${body.slice(0, 24)}`;
  const direction = clean(message.direction) || inferDirection(message);
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.map(normalizeAttachment)
    : Array.isArray(message.files)
      ? message.files.map(normalizeAttachment)
      : [];

  return {
    id,
    source,
    bookingId: clean(message.bookingId || bookingId),
    direction,
    authorName: firstNonEmpty([
      message.authorName,
      message.author_name,
      message.senderName,
      message.sender_name,
      message.from,
      direction === "guest" ? "Guest" : "Zenfulcove Glamping",
    ]),
    subject: clean(message.subject),
    body,
    timestamp,
    status: clean(message.status || message.message_status || "sent"),
    attachments,
  };
}

function collectArrays(value, output = [], depth = 0) {
  if (!value || depth > 5) return output;
  if (Array.isArray(value)) {
    if (
      value.some(
        (item) =>
          item &&
          typeof item === "object" &&
          (item.message || item.body || item.text || item.content || item.html)
      )
    ) {
      output.push(value);
      return output;
    }
    value.forEach((item) => collectArrays(item, output, depth + 1));
    return output;
  }
  if (typeof value !== "object") return output;

  const likelyKeys = [
    "messages",
    "thread_messages",
    "conversation_messages",
    "items",
    "data",
    "results",
  ];
  for (const key of likelyKeys) {
    if (Array.isArray(value[key])) collectArrays(value[key], output, depth + 1);
  }
  return output;
}

export function extractStayMessagesFromLodgify(payload, { bookingId = "" } = {}) {
  const arrays = collectArrays(payload);
  return arrays
    .flat()
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeStayMessage(item, { source: "lodgify", bookingId }))
    .filter((message) => message.body || message.attachments?.length);
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

export async function prepareStayMessagesForResponse(messages = []) {
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      attachments: await signStayMessageAttachments(message.attachments || []),
    }))
  );
}

export function mergeStayMessages(...groups) {
  const byKey = new Map();
  for (const message of groups.flat().filter(Boolean)) {
    const normalized = normalizeStayMessage(message, {
      source: message.source || "local",
      bookingId: message.bookingId,
    });
    const key = [
      normalized.source,
      normalized.id,
      normalized.timestamp,
      normalized.body.slice(0, 80),
    ].join(":");
    if (!byKey.has(key)) byKey.set(key, normalized);
  }

  return Array.from(byKey.values()).sort(
    (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
  );
}

export function buildLodgifyGuestMessageBody({ body, attachments = [] }) {
  const text = clean(body);
  const links = (attachments || [])
    .map((attachment) => {
      const name = clean(attachment.fileName || "Attachment");
      const url = clean(attachment.signedUrl || attachment.url);
      return url ? `${name}: ${url}` : "";
    })
    .filter(Boolean);

  if (!links.length) return text;

  return [
    text || "Guest sent attachment(s) from the My Stay portal.",
    "",
    "Attachment(s):",
    ...links,
  ].join("\n");
}
