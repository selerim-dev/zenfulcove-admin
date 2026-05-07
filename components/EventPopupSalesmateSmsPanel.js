"use client";

import { useState } from "react";
import SendGridListPicker from "./SendGridListPicker";
import Toggle from "./Toggle";

const DEFAULT_SMS = [
  {
    id: "event_popup_sms_day_0",
    daysAfterTrigger: 0,
    messageBody: "",
    enabled: true,
  },
];

function XButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 w-8 rounded-full border border-red-200 text-red-500 hover:border-red-300 hover:text-red-700 transition-colors"
      aria-label="Remove SMS follow-up"
      title="Remove"
    >
      ×
    </button>
  );
}

function createFollowupId(daysAfterTrigger, index) {
  return `event_popup_sms_day_${Number(daysAfterTrigger) || 0}_${Date.now()}_${index}`;
}

export default function EventPopupSalesmateSmsPanel({ config, onChange }) {
  const safeConfig = config || {};
  const sms = safeConfig.sms || DEFAULT_SMS;
  const testDestinations = {
    sms: "",
    ...(safeConfig.testDestinations || {}),
  };
  const tags = Array.isArray(safeConfig.salesmateTags)
    ? safeConfig.salesmateTags.join(", ")
    : "admin portal, event popup";
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testDestination, setTestDestination] = useState("");
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState("");

  function updateConfig(patch) {
    onChange({ ...safeConfig, ...patch });
  }

  function updateField(field, value) {
    updateConfig({ [field]: value });
  }

  function updateSms(index, field, value) {
    const list = [...sms];
    list[index] = { ...list[index], [field]: value };
    if (!list[index].id) {
      list[index].id = createFollowupId(list[index].daysAfterTrigger, index);
    }
    updateConfig({ sms: list });
  }

  function addSms() {
    const nextIndex = sms.length;
    updateConfig({
      sms: [
        ...sms,
        {
          id: createFollowupId(1, nextIndex),
          daysAfterTrigger: 1,
          messageBody: "",
          enabled: true,
        },
      ],
    });
  }

  function removeSms(index) {
    if (!window.confirm("Remove this event popup SMS follow-up?")) return;
    updateConfig({ sms: sms.filter((_, i) => i !== index) });
  }

  function updateTags(value) {
    updateConfig({
      salesmateTags: value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  }

  function updateTestDestination(value) {
    updateConfig({
      testDestinations: {
        ...testDestinations,
        sms: value,
      },
    });
  }

  function openTestModal() {
    setTestDestination(testDestinations.sms || "");
    setTestResult(null);
    setTestError("");
    setTestModalOpen(true);
  }

  async function runTest(dryRun) {
    setTestRunning(true);
    setTestError("");
    setTestResult(null);

    try {
      updateTestDestination(testDestination);

      const eventPopupSalesmateSms = {
        ...safeConfig,
        testDestinations: {
          ...testDestinations,
          sms: testDestination,
        },
      };

      const res = await fetch("/api/event-popup-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventPopupSalesmateSms,
          dryRun,
          destination: dryRun ? "" : testDestination,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Event popup test failed.");
      }

      setTestResult(data);
    } catch (err) {
      setTestError(err.message || "Event popup test failed.");
    } finally {
      setTestRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl text-forest">Event Popup Salesmate SMS</h2>
        <Toggle enabled={safeConfig.enabled} onChange={(enabled) => updateField("enabled", enabled)} />
      </div>

      <p className="text-sm text-forest/70">
        Sync event popup contacts from SendGrid into Salesmate and send SMS follow-ups from the daily cron.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium text-forest">Salesmate Sync</h3>
            <p className="text-xs text-forest/50 mt-1">
              Contacts are created with lead source Website and the configured tags.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={openTestModal}
              className="rounded-full border border-grove/30 px-4 py-2 text-sm font-medium text-grove hover:border-grove hover:text-forest transition-colors"
            >
              Test Event Popup SMS
            </button>
            <Toggle
              enabled={safeConfig.syncToSalesmate !== false}
              onChange={(enabled) => updateField("syncToSalesmate", enabled)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SendGridListPicker
            label="SendGrid Event Popup List"
            value={safeConfig.sendgridContactListId || ""}
            onChange={(value) => updateField("sendgridContactListId", value)}
          />
          <div>
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              SMS Sender Number
            </label>
            <input
              type="text"
              value={safeConfig.twilioFromNumber || ""}
              onChange={(e) => updateField("twilioFromNumber", e.target.value)}
              placeholder="Uses TWILIO_FROM_NUMBER when blank"
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
          <div>
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              Salesmate Lead Source
            </label>
            <input
              type="text"
              value={safeConfig.salesmateLeadSource || "Website"}
              onChange={(e) => updateField("salesmateLeadSource", e.target.value)}
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
          <div>
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              Salesmate Tags
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => updateTags(e.target.value)}
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-sand overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <h3 className="text-lg font-medium text-forest">SMS Follow-Ups</h3>
            <p className="text-xs text-forest/50 mt-1">
              Trigger date is the first day this automation sees the SendGrid contact, so existing list members start at day 0.
            </p>
          </div>
          <button
            type="button"
            onClick={addSms}
            className="text-sm font-medium text-grove hover:text-forest transition-colors"
          >
            Add SMS Follow-up
          </button>
        </div>

        <div className="border-t border-sand px-5 py-5 space-y-4">
          {sms.map((smsConfig, idx) => (
            <div key={smsConfig.id || `sms-${idx}`} className="rounded-xl border border-sand bg-cream/50 p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-forest">
                  Day {Number(smsConfig.daysAfterTrigger) || 0} SMS
                </span>
                <div className="flex items-center gap-3">
                  <Toggle enabled={smsConfig.enabled !== false} onChange={(value) => updateSms(idx, "enabled", value)} />
                  {sms.length > 1 ? <XButton onClick={() => removeSms(idx)} /> : null}
                </div>
              </div>

              <div>
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                  Days After Trigger
                </label>
                <input
                  type="number"
                  min={0}
                  value={smsConfig.daysAfterTrigger}
                  onChange={(e) => updateSms(idx, "daysAfterTrigger", parseInt(e.target.value, 10) || 0)}
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full max-w-40 focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                    Message Body
                  </label>
                  <span className="mb-1 text-xs text-forest/40">
                    {String(smsConfig.messageBody || "").length} characters
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={smsConfig.messageBody || ""}
                  onChange={(e) => updateSms(idx, "messageBody", e.target.value)}
                  placeholder="Your Zenfulcove event popup text..."
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {testModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/35 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-sand p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-medium text-forest">Test Event Popup SMS</h3>
                <p className="text-sm text-forest/55 mt-1">
                  Run a dry run or send one routed test SMS without saving send-state.
                </p>
              </div>
              <button type="button" onClick={() => setTestModalOpen(false)} className="text-2xl leading-none text-forest/40 hover:text-forest">
                ×
              </button>
            </div>

            <div>
              <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                Test Phone Number
              </label>
              <input
                type="text"
                value={testDestination}
                onChange={(e) => setTestDestination(e.target.value)}
                placeholder="+18325551234"
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>

            {testError ? <p className="text-sm text-red-600">{testError}</p> : null}

            {testResult ? (
              <div className="rounded-xl border border-sand bg-cream/50 p-4 space-y-2 max-h-64 overflow-auto">
                <div className="text-xs uppercase tracking-wider text-forest/50">Latest Test Result</div>
                {(Array.isArray(testResult.logs) ? testResult.logs : []).map((log, index) => (
                  <div key={`${log.timestamp}-${index}`} className="text-sm text-forest/80">
                    <span className="font-medium">[{String(log.status || "info").toUpperCase()}]</span> {log.action}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="rounded-full border border-sand px-4 py-2 text-sm text-forest/70 hover:text-forest"
              >
                Close
              </button>
              <button
                type="button"
                disabled={testRunning}
                onClick={() => runTest(true)}
                className="rounded-full border border-grove/30 px-4 py-2 text-sm font-medium text-grove hover:border-grove hover:text-forest disabled:opacity-50"
              >
                {testRunning ? "Running..." : "Run Dry Run"}
              </button>
              <button
                type="button"
                disabled={testRunning || !testDestination.trim()}
                onClick={() => runTest(false)}
                className="rounded-full bg-grove px-4 py-2 text-sm font-medium text-white hover:bg-forest disabled:opacity-50"
              >
                {testRunning ? "Running..." : "Send Test"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
