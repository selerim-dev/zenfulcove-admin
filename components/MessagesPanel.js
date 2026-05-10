"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

function formatPhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatRelative(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return date.toLocaleDateString();
}

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MessagesPanel() {
  const [numbers, setNumbers] = useState([]);
  const [activeNumber, setActiveNumber] = useState("");
  const [threads, setThreads] = useState([]);
  const [activeContact, setActiveContact] = useState("");
  const [messages, setMessages] = useState([]);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState(null);
  const messagesEndRef = useRef(null);

  const fetchThreads = useCallback(async (twilioNumber) => {
    setLoadingThreads(true);
    setError("");
    try {
      const url = twilioNumber
        ? `/api/messages?twilioNumber=${encodeURIComponent(twilioNumber)}`
        : `/api/messages`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load messages.");
      setNumbers(data.numbers || []);
      setThreads(data.threads || []);
    } catch (err) {
      setError(err.message || "Failed to load messages.");
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const fetchMessages = useCallback(async (twilioNumber, contactPhone) => {
    if (!twilioNumber || !contactPhone) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    try {
      const res = await fetch(
        `/api/messages?twilioNumber=${encodeURIComponent(twilioNumber)}&contactPhone=${encodeURIComponent(contactPhone)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load thread.");
      setMessages(data.messages || []);
    } catch (err) {
      setError(err.message || "Failed to load thread.");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    fetchThreads(activeNumber);
  }, [activeNumber, fetchThreads]);

  useEffect(() => {
    if (activeContact && activeNumber) {
      fetchMessages(activeNumber, activeContact);
    }
  }, [activeContact, activeNumber, fetchMessages]);

  // Poll for new messages every 15s.
  useEffect(() => {
    const id = setInterval(() => {
      fetchThreads(activeNumber);
      if (activeContact && activeNumber) fetchMessages(activeNumber, activeContact);
    }, 15_000);
    return () => clearInterval(id);
  }, [activeNumber, activeContact, fetchThreads, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return threads;
    const needle = search.toLowerCase();
    return threads.filter(
      (t) =>
        String(t.contactPhone || "").toLowerCase().includes(needle) ||
        String(t.lastMessagePreview || "").toLowerCase().includes(needle)
    );
  }, [threads, search]);

  const activeNumberMeta = useMemo(
    () => numbers.find((n) => n.number === activeNumber),
    [numbers, activeNumber]
  );

  const composerNumber = activeNumber || (activeContact && messages[0]?.twilioNumber) || "";
  const composerEnabled = Boolean(
    composerNumber &&
      activeContact &&
      numbers.find((n) => n.number === composerNumber && n.enabled)
  );

  async function handleSend(e) {
    e.preventDefault();
    if (!composer.trim() || !composerEnabled) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twilioNumber: composerNumber,
          contactPhone: activeContact,
          body: composer.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to send.");
      setComposer("");
      await Promise.all([
        fetchMessages(composerNumber, activeContact),
        fetchThreads(activeNumber),
      ]);
    } catch (err) {
      setError(err.message || "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  function selectThread(thread) {
    setActiveContact(thread.contactPhone);
    if (!activeNumber) setActiveNumber(thread.twilioNumber);
  }

  async function handleSync({ reset = false } = {}) {
    if (syncing) return;
    if (reset) {
      const ok = window.confirm(
        activeNumber
          ? "Wipe stored messages for this number and re-fetch from Twilio?"
          : "Wipe ALL stored messages across all numbers and re-fetch from Twilio?"
      );
      if (!ok) return;
    }
    setSyncing(true);
    setError("");
    setSyncSummary(null);
    try {
      if (reset) {
        const clearRes = await fetch("/api/messages/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ twilioNumber: activeNumber || undefined }),
        });
        const clearData = await clearRes.json();
        if (!clearRes.ok) throw new Error(clearData?.error || "Clear failed.");
        setActiveContact("");
        setMessages([]);
      }

      const res = await fetch("/api/messages/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twilioNumber: activeNumber || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Sync failed.");
      setSyncSummary(data.summary || []);
      await fetchThreads(activeNumber);
      if (activeContact && activeNumber) await fetchMessages(activeNumber, activeContact);
    } catch (err) {
      setError(err.message || "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-forest">Messages</h2>
          <p className="text-sm text-forest/60 mt-1">
            Two-way SMS conversations across your Twilio numbers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSync({ reset: true })}
            disabled={syncing}
            title="Wipe stored messages and re-fetch fresh from Twilio."
            className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:border-red-400 hover:text-red-700 transition-colors disabled:opacity-50"
          >
            Reset & re-sync
          </button>
          <button
            type="button"
            onClick={() => handleSync()}
            disabled={syncing}
            title="Pull the last 365 days of SMS history from Twilio (only conversations with replies)."
            className="rounded-full border border-grove/30 px-4 py-2 text-sm font-medium text-grove hover:border-grove hover:text-forest transition-colors disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync from Twilio"}
          </button>
        </div>
      </div>

      {syncSummary ? (
        <div className="rounded-lg bg-cream border border-sand px-4 py-3 text-sm text-forest/80 space-y-1">
          <div className="font-medium">Sync complete.</div>
          {syncSummary.map((s) => (
            <div key={s.twilioNumber} className="text-xs">
              {s.label} ({formatPhone(s.twilioNumber)}): {s.threads} thread{s.threads === 1 ? "" : "s"} with replies, {s.importedInbound} inbound + {s.importedOutbound} outbound messages imported.
            </div>
          ))}
        </div>
      ) : null}

      {/* Number filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setActiveNumber("");
            setActiveContact("");
          }}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            !activeNumber
              ? "bg-grove text-white"
              : "bg-white border border-sand text-forest/70 hover:text-forest"
          }`}
        >
          All
        </button>
        {numbers.map((n) => (
          <button
            key={n.id}
            type="button"
            disabled={!n.enabled}
            onClick={() => {
              setActiveNumber(n.number);
              setActiveContact("");
            }}
            title={n.comingSoon ? "Coming Soon" : n.number}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors flex items-center gap-2 ${
              activeNumber === n.number && n.enabled
                ? "bg-grove text-white"
                : n.enabled
                  ? "bg-white border border-sand text-forest/70 hover:text-forest"
                  : "bg-sand/50 border border-sand text-forest/40 cursor-not-allowed"
            }`}
          >
            <span>{n.label}</span>
            {n.enabled ? (
              <span className="text-xs opacity-70 font-mono">{formatPhone(n.number)}</span>
            ) : (
              <span className="text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 bg-forest/10 text-forest/50">
                Coming Soon
              </span>
            )}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="bg-white rounded-xl shadow-sm border border-sand overflow-hidden grid grid-cols-1 md:grid-cols-[320px_1fr]" style={{ height: "calc(100vh - 320px)", minHeight: 480 }}>
        {/* Threads list */}
        <aside className="border-r border-sand flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-sand">
            <input
              type="search"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm rounded-lg border border-sand px-3 py-2 focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <div className="p-6 text-center text-sm text-forest/50">Loading...</div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-6 text-center text-sm text-forest/50">
                {search ? "No matches." : "No conversations yet."}
              </div>
            ) : (
              <ul>
                {filteredThreads.map((t) => {
                  const isActive = t.contactPhone === activeContact && t.twilioNumber === (activeNumber || t.twilioNumber);
                  return (
                    <li key={`${t.twilioNumber}:${t.contactPhone}`}>
                      <button
                        type="button"
                        onClick={() => selectThread(t)}
                        className={`w-full text-left px-4 py-3 border-b border-sand/60 transition-colors ${
                          isActive ? "bg-cream" : "hover:bg-cream/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-forest text-sm truncate">
                            {formatPhone(t.contactPhone)}
                          </span>
                          <span className="text-[11px] text-forest/40 shrink-0">
                            {formatRelative(t.lastMessageAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-xs text-forest/60 truncate">
                            {t.lastMessageDirection === "out" ? "You: " : ""}
                            {t.lastMessagePreview || "—"}
                          </span>
                          {t.unreadCount > 0 && !isActive ? (
                            <span className="shrink-0 rounded-full bg-grove text-white text-[10px] px-2 py-0.5 font-medium">
                              {t.unreadCount}
                            </span>
                          ) : null}
                        </div>
                        {!activeNumber && (
                          <div className="text-[10px] uppercase tracking-wider text-forest/40 mt-1 font-mono">
                            via {formatPhone(t.twilioNumber)}
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Conversation pane */}
        <section className="flex flex-col min-h-0 bg-cream/40">
          {!activeContact ? (
            <div className="flex-1 flex items-center justify-center text-sm text-forest/50">
              Select a conversation to view messages.
            </div>
          ) : (
            <>
              <header className="px-5 py-3 border-b border-sand bg-white flex items-center justify-between">
                <div>
                  <div className="font-medium text-forest">{formatPhone(activeContact)}</div>
                  <div className="text-xs text-forest/50 font-mono">
                    via {formatPhone(composerNumber)}
                    {activeNumberMeta?.label ? ` · ${activeNumberMeta.label}` : ""}
                  </div>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                {loadingMessages && messages.length === 0 ? (
                  <div className="text-center text-sm text-forest/50 py-6">Loading...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-forest/50 py-6">No messages yet.</div>
                ) : (
                  messages.map((m) => {
                    const out = m.direction === "out";
                    return (
                      <div
                        key={m.id || `${m.timestamp}-${m.direction}`}
                        className={`flex ${out ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm ${
                            out
                              ? "bg-grove text-white rounded-br-md"
                              : "bg-white text-forest border border-sand rounded-bl-md"
                          }`}
                        >
                          <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                          <div
                            className={`text-[10px] mt-1 ${
                              out ? "text-white/70" : "text-forest/40"
                            }`}
                          >
                            {formatTime(m.timestamp)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form
                onSubmit={handleSend}
                className="border-t border-sand bg-white px-4 py-3 flex items-end gap-2"
              >
                <textarea
                  rows={1}
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                  placeholder={
                    composerEnabled
                      ? "Type a message..."
                      : "This number is not enabled for sending."
                  }
                  disabled={!composerEnabled || sending}
                  className="flex-1 resize-none rounded-2xl border border-sand px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-grove/30 disabled:bg-sand/30 disabled:text-forest/40"
                  style={{ maxHeight: 120 }}
                />
                <button
                  type="submit"
                  disabled={!composerEnabled || !composer.trim() || sending}
                  className="rounded-full bg-grove hover:bg-forest text-white text-sm font-medium px-5 py-2 transition-colors disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
