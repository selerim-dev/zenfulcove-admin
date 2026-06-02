"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveGuestBookingSession, stayHref } from "@/components/customer/bookingSession";

type StayMessageAttachment = {
  fileName?: string;
  signedUrl?: string;
  url?: string;
  contentType?: string;
  size?: number;
};

type StayMessage = {
  id: string;
  direction: "guest" | "host" | string;
  authorName?: string;
  body?: string;
  timestamp?: number;
  status?: string;
  attachments?: StayMessageAttachment[];
};

type ThreadResponse = {
  ok?: boolean;
  error?: string;
  details?: string;
  booking?: {
    id: string;
    propertyName?: string;
    guestName?: string;
    guestFirstName?: string;
    arrivalIso?: string;
    departureIso?: string;
  };
  capabilities?: {
    attachments?: boolean;
    maxAttachmentBytes?: number;
  };
  messages?: StayMessage[];
};

const MAX_FILES = 5;

function clean(value?: unknown) {
  return String(value || "").trim();
}

function formatTime(timestamp?: number) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatBytes(size?: number) {
  const value = Number(size) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentUrl(attachment: StayMessageAttachment) {
  return clean(attachment.signedUrl || attachment.url);
}

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function PaperclipIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7L9.7 17.7a2 2 0 0 1-2.8-2.8l8.9-8.9" />
    </svg>
  );
}

function SendIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
    </svg>
  );
}

function RefreshIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8" />
      <path d="M18 2v4h4" />
      <path d="M6 22v-4H2" />
    </svg>
  );
}

export default function GuestStayMessages({
  reservation,
  lastName,
}: {
  reservation: string;
  lastName?: string;
}) {
  const [data, setData] = useState<ThreadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [composer, setComposer] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const params = useMemo(() => {
    const next = new URLSearchParams({ reservationId: reservation });
    if (lastName) next.set("lastName", lastName);
    return next.toString();
  }, [reservation, lastName]);

  async function loadThread({ silent = false } = {}) {
    if (!silent) setLoading(true);
    if (silent) setRefreshing(true);
    setError("");
    try {
      const res = await fetch(`/api/bookings/stay/messages?${params}`);
      const json = (await res.json().catch(() => ({}))) as ThreadResponse;
      if (!res.ok) {
        throw new Error(json.error || json.details || "Could not load messages.");
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load messages.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    saveGuestBookingSession({ reservation, lastName });
  }, [reservation, lastName]);

  useEffect(() => {
    let active = true;
    (async () => {
      await loadThread();
      if (!active) return;
    })();
    const id = window.setInterval(() => {
      loadThread({ silent: true });
    }, 15_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data?.messages?.length, sending]);

  function addFiles(selected: FileList | null) {
    if (!selected?.length) return;
    const existing = new Map(files.map((file) => [fileKey(file), file]));
    Array.from(selected).forEach((file) => {
      if (existing.size < MAX_FILES) existing.set(fileKey(file), file);
    });
    setFiles(Array.from(existing.values()));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(key: string) {
    setFiles((current) => current.filter((file) => fileKey(file) !== key));
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = composer.trim();
    if (!body && files.length === 0) return;

    setSending(true);
    setError("");
    try {
      const payload = new FormData();
      payload.set("reservationId", reservation);
      payload.set("lastName", lastName || "");
      payload.set("body", body);
      files.forEach((file) => payload.append("attachments", file));

      const res = await fetch("/api/bookings/stay/messages", {
        method: "POST",
        body: payload,
      });
      const json = (await res.json().catch(() => ({}))) as ThreadResponse;
      if (!res.ok) {
        throw new Error(json.error || json.details || "Could not send message.");
      }
      setData(json);
      setComposer("");
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  const messages = data?.messages || [];
  const attachmentsEnabled = data?.capabilities?.attachments !== false;
  const maxAttachmentBytes = data?.capabilities?.maxAttachmentBytes || 8 * 1024 * 1024;
  const selectedFileError = files.find((file) => file.size > maxAttachmentBytes);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-5xl items-center justify-center">
        <p className="text-sm text-[var(--color-ink-muted)]">Loading messages...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
          Messages
        </p>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">
          We could not open your messages.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          {error}
        </p>
        <Link
          href={stayHref(reservation, lastName || "")}
          className="mt-6 inline-flex rounded-full bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition hover:bg-[var(--color-accent-strong)]"
        >
          Back to My Stay
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <section className="rounded-[24px] border border-[var(--color-border)] bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              My Stay Messages
            </p>
            <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight text-[var(--color-ink)] md:text-4xl">
              Chat with Zenfulcove
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-muted)]">
              {data?.booking?.propertyName || "Your stay"} - Booking {data?.booking?.id || reservation}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => loadThread({ silent: true })}
              disabled={refreshing}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-60"
              title="Refresh messages"
            >
              <RefreshIcon className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <Link
              href={stayHref(reservation, lastName || "")}
              className="inline-flex items-center rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              My Stay
            </Link>
          </div>
        </div>
      </section>

      <section className="flex h-[calc(100vh-210px)] min-h-[360px] max-h-[760px] flex-col overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white shadow-sm md:min-h-[460px]">
        <div className="border-b border-[var(--color-border)] px-5 py-3">
          <p className="text-xs font-medium text-[var(--color-ink-muted)]">
            Messages are tied to this booking thread. Replies from staff may also appear in your original booking channel depending on its rules.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg)]/60 px-4 py-5 md:px-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-[360px] max-w-md flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[var(--color-accent)] shadow-sm">
                <SendIcon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-serif text-2xl font-medium tracking-tight">
                No messages yet
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                Send a note here and it will be attached to your stay conversation.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => {
                const fromGuest = message.direction === "guest";
                return (
                  <article
                    key={`${message.id}-${message.timestamp}`}
                    className={`flex ${fromGuest ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[86%] rounded-2xl px-4 py-3 shadow-sm md:max-w-[68%] ${
                        fromGuest
                          ? "rounded-br-md bg-[var(--color-accent)] text-white"
                          : "rounded-bl-md border border-[var(--color-border)] bg-white text-[var(--color-ink)]"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <p
                          className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                            fromGuest ? "text-white/75" : "text-[var(--color-ink-muted)]"
                          }`}
                        >
                          {fromGuest ? "You" : clean(message.authorName) || "Zenfulcove"}
                        </p>
                        <time
                          className={`shrink-0 text-[10px] ${
                            fromGuest ? "text-white/70" : "text-[var(--color-ink-muted)]"
                          }`}
                        >
                          {formatTime(message.timestamp)}
                        </time>
                      </div>
                      {clean(message.body) ? (
                        <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed">
                          {message.body}
                        </p>
                      ) : null}
                      {message.attachments?.length ? (
                        <div className="mt-3 space-y-2">
                          {message.attachments.map((attachment, index) => {
                            const url = attachmentUrl(attachment);
                            const label = clean(attachment.fileName) || `Attachment ${index + 1}`;
                            return url ? (
                              <a
                                key={`${label}-${index}`}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition ${
                                  fromGuest
                                    ? "bg-white/15 text-white hover:bg-white/25"
                                    : "bg-[var(--color-bg)] text-[var(--color-ink)] hover:text-[var(--color-accent)]"
                                }`}
                              >
                                <PaperclipIcon className="h-4 w-4 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{label}</span>
                                {attachment.size ? (
                                  <span className="shrink-0 opacity-75">
                                    {formatBytes(attachment.size)}
                                  </span>
                                ) : null}
                              </a>
                            ) : (
                              <div
                                key={`${label}-${index}`}
                                className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-xs"
                              >
                                <PaperclipIcon className="h-4 w-4 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{label}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <form onSubmit={sendMessage} className="border-t border-[var(--color-border)] bg-white p-4">
          {error ? (
            <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {files.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {files.map((file) => (
                <span
                  key={fileKey(file)}
                  className={`inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-1.5 text-xs ${
                    file.size > maxAttachmentBytes
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-ink)]"
                  }`}
                >
                  <PaperclipIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-[var(--color-ink-muted)]">
                    {formatBytes(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(fileKey(file))}
                    className="ml-1 text-sm leading-none text-current opacity-70 transition hover:opacity-100"
                    aria-label={`Remove ${file.name}`}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {selectedFileError ? (
            <p className="mb-3 text-xs text-red-700">
              {selectedFileError.name} is larger than {formatBytes(maxAttachmentBytes)}.
            </p>
          ) : null}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              disabled={!attachmentsEnabled || sending}
              onChange={(event) => addFiles(event.target.files)}
              accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx"
            />
            <button
              type="button"
              disabled={!attachmentsEnabled || sending}
              onClick={() => fileInputRef.current?.click()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
              title={attachmentsEnabled ? "Attach files" : "Attachments are not configured"}
            >
              <PaperclipIcon className="h-5 w-5" />
            </button>
            <label className="min-w-0 flex-1">
              <span className="sr-only">Message</span>
              <textarea
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                rows={2}
                placeholder="Type your message..."
                className="max-h-40 min-h-11 w-full resize-y rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm leading-relaxed text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
              />
            </label>
            <button
              type="submit"
              disabled={
                sending ||
                Boolean(selectedFileError) ||
                (!composer.trim() && files.length === 0)
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)] text-white transition hover:bg-[var(--color-accent-strong)] disabled:opacity-50"
              title="Send message"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
