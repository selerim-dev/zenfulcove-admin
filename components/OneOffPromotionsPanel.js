"use client";

import { useState } from "react";
import { PROMOTION_CONTACT_LISTS } from "@/lib/promotion-lists";

const CHANNELS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "both", label: "Both" },
];

function ListOption({ checked, title, subtitle, onChange }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
        checked ? "border-grove bg-cream" : "border-sand bg-white"
      }`}
    >
      <input
        type="radio"
        name="promotion-list"
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 accent-grove"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-forest">{title}</span>
        <span className="mt-1 block break-all text-xs text-forest/50">{subtitle}</span>
      </span>
    </label>
  );
}

function FieldLabel({ children }) {
  return (
    <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
      {children}
    </label>
  );
}

function ResultLog({ result }) {
  const logs = Array.isArray(result?.logs) ? result.logs : [];
  if (logs.length === 0) return null;

  return (
    <div className="rounded-xl border border-sand bg-cream/50 p-4 space-y-2 max-h-80 overflow-auto">
      <div className="text-xs uppercase tracking-wider text-forest/50">
        Latest Result
      </div>
      {logs.map((log, index) => (
        <div key={`${log.timestamp}-${index}`} className="text-sm text-forest/80">
          <span className="font-medium">[{String(log.status || "info").toUpperCase()}]</span>{" "}
          {log.action}
        </div>
      ))}
    </div>
  );
}

export default function OneOffPromotionsPanel({ onComplete }) {
  const [selectedList, setSelectedList] = useState("all-clients");
  const [channel, setChannel] = useState("sms");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testSms, setTestSms] = useState("");
  const [testMode, setTestMode] = useState("dryRun");
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [running, setRunning] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);

  const emailSelected = channel === "email" || channel === "both";
  const smsSelected = channel === "sms" || channel === "both";
  const canSubmit =
    Boolean(selectedList) &&
    (!emailSelected || (subject.trim() && emailBody.trim())) &&
    (!smsSelected || smsBody.trim());

  async function runPromotion(mode) {
    if (mode === "send") {
      const selectedLabel =
        PROMOTION_CONTACT_LISTS.find((list) => list.key === selectedList)?.label ||
        selectedList;
      const confirmed = window.confirm(
        `Send this ${channel} promotion to ${selectedLabel} now?`
      );
      if (!confirmed) return;
    }

    setRunning(mode);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          lists: [selectedList],
          channel,
          subject,
          emailBody,
          smsBody,
          testDestinations: {
            email: testEmail,
            sms: testSms,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Promotion request failed.");
      }

      setResult(data);
      if (mode === "send") {
        setResultModalOpen(true);
      }
      if (onComplete) onComplete(1);
    } catch (err) {
      setError(err.message || "Promotion request failed.");
    } finally {
      setRunning("");
    }
  }

  function openTestModal() {
    setTestMode("dryRun");
    setResult(null);
    setError("");
    setTestModalOpen(true);
  }

  async function runModalTest() {
    await runPromotion(testMode);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-serif text-2xl text-forest">One-Off Promotions</h2>
        <p className="text-sm text-forest/70">
          Send immediate promotions from selected SendGrid contact lists.
        </p>
      </div>

      <section className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-5">
        <div>
          <h3 className="text-lg font-medium text-forest">Audience Lists</h3>
          <div className="mt-3 grid grid-cols-1 gap-3">
            {PROMOTION_CONTACT_LISTS.map((list) => (
              <ListOption
                key={list.key}
                title={list.label}
                subtitle={list.listId}
                checked={selectedList === list.key}
                onChange={() => setSelectedList(list.key)}
              />
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Channel</FieldLabel>
          <div className="grid grid-cols-3 rounded-lg border border-sand p-1">
            {CHANNELS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setChannel(item.value)}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  channel === item.value
                    ? "bg-grove text-white"
                    : "text-forest/60 hover:text-forest"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {emailSelected ? (
          <div className="space-y-4">
            <div>
              <FieldLabel>Email Subject</FieldLabel>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>
            <div>
              <FieldLabel>Email Message</FieldLabel>
              <textarea
                rows={7}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>
          </div>
        ) : null}

        {smsSelected ? (
          <div>
            <div className="flex items-end justify-between gap-3">
              <FieldLabel>SMS Message</FieldLabel>
              <span className="mb-1 text-xs text-forest/40">{smsBody.length} characters</span>
            </div>
            <textarea
              rows={5}
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            disabled={Boolean(running) || !canSubmit}
            onClick={openTestModal}
            className="rounded-full border border-grove/30 px-4 py-2 text-sm font-medium text-grove hover:border-grove hover:text-forest disabled:opacity-50"
          >
            Test / Dry Run
          </button>
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {testModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/35 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-sand p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-medium text-forest">Test Promotion</h3>
                <p className="text-sm text-forest/55 mt-1">
                  Uses the selected list and channel from the current promotion.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="text-2xl leading-none text-forest/40 hover:text-forest"
              >
                ×
              </button>
            </div>

            <div>
              <FieldLabel>Run Type</FieldLabel>
              <div className="grid grid-cols-2 rounded-lg border border-sand p-1">
                <button
                  type="button"
                  onClick={() => setTestMode("dryRun")}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    testMode === "dryRun"
                      ? "bg-grove text-white"
                      : "text-forest/60 hover:text-forest"
                  }`}
                >
                  Dry Run
                </button>
                <button
                  type="button"
                  onClick={() => setTestMode("test")}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    testMode === "test"
                      ? "bg-grove text-white"
                      : "text-forest/60 hover:text-forest"
                  }`}
                >
                  Test Send
                </button>
              </div>
            </div>

            {testMode === "test" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {emailSelected ? (
                  <div>
                    <FieldLabel>Test Email</FieldLabel>
                    <input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
                    />
                  </div>
                ) : null}
                {smsSelected ? (
                  <div>
                    <FieldLabel>Test Phone</FieldLabel>
                    <input
                      type="tel"
                      value={testSms}
                      onChange={(e) => setTestSms(e.target.value)}
                      placeholder="+18325551234"
                      className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <ResultLog result={result} />

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="rounded-full border border-sand px-4 py-2 text-sm text-forest/70 hover:text-forest"
              >
                Close
              </button>
              <button
                type="button"
                disabled={
                  Boolean(running) ||
                  !canSubmit ||
                  (testMode === "test" && emailSelected && !testEmail.trim()) ||
                  (testMode === "test" && smsSelected && !testSms.trim())
                }
                onClick={runModalTest}
                className="rounded-full bg-grove px-4 py-2 text-sm font-medium text-white hover:bg-forest disabled:opacity-50"
              >
                {running ? "Running..." : testMode === "dryRun" ? "Run Dry Run" : "Send Test"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resultModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/35 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-sand p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-medium text-forest">Promotion Result</h3>
                <p className="text-sm text-forest/55 mt-1">
                  {result?.status || "Result"} from the latest promotion action.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResultModalOpen(false)}
                className="text-2xl leading-none text-forest/40 hover:text-forest"
              >
                ×
              </button>
            </div>
            <ResultLog result={result} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setResultModalOpen(false)}
                className="rounded-full bg-grove px-4 py-2 text-sm font-medium text-white hover:bg-forest"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          disabled={Boolean(running) || !canSubmit}
          onClick={() => runPromotion("send")}
          className="rounded-full bg-grove px-5 py-2 text-sm font-medium text-white hover:bg-forest disabled:opacity-50"
        >
          {running === "send" ? "Sending..." : "Send Promotion"}
        </button>
      </div>
    </div>
  );
}
