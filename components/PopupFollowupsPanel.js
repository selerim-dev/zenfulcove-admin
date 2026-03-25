"use client";

import { useMemo, useState } from "react";
import Toggle from "./Toggle";

const DEFAULT_EMAILS = [
  { daysAfterTrigger: 2, templateId: "", label: "Follow-up (2 days after)" },
  { daysAfterTrigger: 3, templateId: "", label: "Follow-up (3 days after)" },
  { daysAfterTrigger: 6, templateId: "", label: "Follow-up (6 days after)" },
];

const DEFAULT_SMS = [
  { daysAfterTrigger: 2, messageKey: "sms_day_2", label: "SMS (2 days after)", messageBody: "", enabled: true },
  { daysAfterTrigger: 3, messageKey: "sms_day_3", label: "SMS (3 days after)", messageBody: "", enabled: true },
  { daysAfterTrigger: 6, messageKey: "sms_day_6", label: "SMS (6 days after)", messageBody: "", enabled: true },
];

const DEFAULT_TEST_DESTINATIONS = {
  email: "",
  sms: "",
};

function XButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 w-8 rounded-full border border-red-200 text-red-500 hover:border-red-300 hover:text-red-700 transition-colors"
      aria-label="Remove item"
      title="Remove"
    >
      ×
    </button>
  );
}

function CollapsibleSection({ title, description, open, onToggle, children, action }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-sand overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="text-lg text-forest">{open ? "▾" : "▸"}</span>
          <div className="min-w-0">
            <h3 className="text-lg font-medium text-forest">{title}</h3>
            {description ? <p className="text-xs text-forest/50 mt-1">{description}</p> : null}
          </div>
        </button>
        {action}
      </div>
      {open ? <div className="border-t border-sand px-5 py-5 space-y-4">{children}</div> : null}
    </div>
  );
}

export default function PopupFollowupsPanel({ config, sendgridConfig, onChange }) {
  const safeConfig = config || {};
  const channelMode = safeConfig.channelMode || "email";
  const emails = safeConfig.emails || DEFAULT_EMAILS;
  const sms = safeConfig.sms || DEFAULT_SMS;
  const testDestinations = {
    ...DEFAULT_TEST_DESTINATIONS,
    ...(safeConfig.testDestinations || {}),
  };

  const [emailSectionOpen, setEmailSectionOpen] = useState(true);
  const [smsSectionOpen, setSmsSectionOpen] = useState(true);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testChannel, setTestChannel] = useState(channelMode === "sms" ? "sms" : "email");
  const [testDestination, setTestDestination] = useState("");
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState("");

  const emailEnabled = channelMode === "email" || channelMode === "both";
  const smsEnabled = channelMode === "sms" || channelMode === "both";

  const testPlaceholder = useMemo(() => {
    return testChannel === "sms" ? "+18325551234" : "you@example.com";
  }, [testChannel]);

  function updateConfig(patch) {
    onChange({ ...safeConfig, ...patch });
  }

  function updateEnabled(enabled) {
    updateConfig({ enabled });
  }

  function updateField(field, value) {
    updateConfig({ [field]: value });
  }

  function updateTestDestination(channel, value) {
    updateConfig({
      testDestinations: {
        ...testDestinations,
        [channel]: value,
      },
    });
  }

  function setChannelMode(nextEmailEnabled, nextSmsEnabled) {
    if (nextEmailEnabled && nextSmsEnabled) {
      updateField("channelMode", "both");
      return;
    }
    if (nextEmailEnabled) {
      updateField("channelMode", "email");
      return;
    }
    if (nextSmsEnabled) {
      updateField("channelMode", "sms");
    }
  }

  function toggleEmail(nextValue) {
    if (!nextValue && !smsEnabled) return;
    setChannelMode(nextValue, smsEnabled);
  }

  function toggleSms(nextValue) {
    if (!nextValue && !emailEnabled) return;
    setChannelMode(emailEnabled, nextValue);
  }

  function updateEmail(index, field, value) {
    const list = [...emails];
    list[index] = { ...list[index], [field]: value };
    updateConfig({ emails: list });
  }

  function addEmail() {
    updateConfig({
      emails: [
        ...emails,
        { daysAfterTrigger: 1, templateId: "", label: "Follow-up" },
      ],
    });
  }

  function removeEmail(index) {
    if (!window.confirm("Remove this email follow-up?")) return;
    updateConfig({ emails: emails.filter((_, i) => i !== index) });
  }

  function updateSms(index, field, value) {
    const list = [...sms];
    list[index] = { ...list[index], [field]: value };
    updateConfig({ sms: list });
  }

  function addSms() {
    updateConfig({
      sms: [
        ...sms,
        {
          daysAfterTrigger: 1,
          messageKey: `sms_day_${sms.length + 1}`,
          label: "SMS Follow-up",
          messageBody: "",
          enabled: true,
        },
      ],
    });
  }

  function removeSms(index) {
    if (!window.confirm("Remove this SMS follow-up?")) return;
    updateConfig({ sms: sms.filter((_, i) => i !== index) });
  }

  function openTestModal(initialChannel = channelMode === "sms" ? "sms" : "email") {
    setTestChannel(initialChannel);
    setTestDestination(testDestinations[initialChannel] || "");
    setTestResult(null);
    setTestError("");
    setTestModalOpen(true);
  }

  async function runTest(dryRun) {
    setTestRunning(true);
    setTestError("");
    setTestResult(null);

    try {
      updateTestDestination(testChannel, testDestination);

      const popupFollowups = {
        ...safeConfig,
        testDestinations: {
          ...testDestinations,
          [testChannel]: testDestination,
        },
      };

      const res = await fetch("/api/popup-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          popupFollowups,
          sendgrid: sendgridConfig,
          channel: testChannel,
          dryRun,
          destination: dryRun ? "" : testDestination,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Popup test failed.");
      }

      setTestResult(data);
    } catch (err) {
      setTestError(err.message || "Popup test failed.");
    } finally {
      setTestRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl text-forest">Popup Follow Ups</h2>
        <Toggle enabled={safeConfig.enabled} onChange={updateEnabled} />
      </div>

      <p className="text-sm text-forest/70">
        The popup trigger date is shared by email and SMS. Sender details for SMS now come only from env vars.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium text-forest">Channel Mode</h3>
            <p className="text-xs text-forest/50 mt-1">
              Choose which channels the popup automation should actively use.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openTestModal()}
            className="rounded-full border border-grove/30 px-4 py-2 text-sm font-medium text-grove hover:border-grove hover:text-forest transition-colors"
          >
            Test Popup Drip
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-sand bg-cream/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-forest">Email</div>
                <div className="text-xs text-forest/50 mt-1">Enable popup follow-up emails.</div>
              </div>
              <Toggle enabled={emailEnabled} onChange={toggleEmail} />
            </div>
          </div>
          <div className="rounded-xl border border-sand bg-cream/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-forest">SMS</div>
                <div className="text-xs text-forest/50 mt-1">Enable popup follow-up texts.</div>
              </div>
              <Toggle enabled={smsEnabled} onChange={toggleSms} />
            </div>
          </div>
        </div>
      </div>

      <CollapsibleSection
        title="Email Follow-Up Settings"
        description="Email list source, trigger tracking, and SendGrid drip templates."
        open={emailSectionOpen}
        onToggle={() => setEmailSectionOpen((value) => !value)}
        action={
          <button
            type="button"
            onClick={addEmail}
            className="text-sm font-medium text-grove hover:text-forest transition-colors"
          >
            Add Email Follow-up
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              SendGrid Contact List ID
            </label>
            <input
              type="text"
              value={safeConfig.sendgridContactListId || ""}
              onChange={(e) => updateField("sendgridContactListId", e.target.value)}
              placeholder="44b5b3f5-d03d-4552-997f-8715a906d5b8"
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
          <div>
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              Triggered Date Field Key
            </label>
            <input
              type="text"
              value={safeConfig.popupTriggeredFieldId || ""}
              onChange={(e) => updateField("popupTriggeredFieldId", e.target.value)}
              placeholder="popup_triggered_at"
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              Sent Email Field Key
            </label>
            <input
              type="text"
              value={safeConfig.popupSentTemplatesFieldId || ""}
              onChange={(e) => updateField("popupSentTemplatesFieldId", e.target.value)}
              placeholder="popup_sent_templates"
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
        </div>

        {emails.map((emailConfig, idx) => (
          <div key={`email-${idx}`} className="rounded-xl border border-sand bg-cream/50 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-forest">{emailConfig.label || `Email ${idx + 1}`}</span>
              {emails.length > 1 ? <XButton onClick={() => removeEmail(idx)} /> : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">Days After Trigger</label>
                <input
                  type="number"
                  min={0}
                  value={emailConfig.daysAfterTrigger}
                  onChange={(e) => updateEmail(idx, "daysAfterTrigger", parseInt(e.target.value, 10) || 0)}
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">SendGrid Template ID</label>
                <input
                  type="text"
                  value={emailConfig.templateId || ""}
                  onChange={(e) => updateEmail(idx, "templateId", e.target.value)}
                  placeholder="d-xxxxxxxx"
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">Label</label>
              <input
                type="text"
                value={emailConfig.label || ""}
                onChange={(e) => updateEmail(idx, "label", e.target.value)}
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        title="SMS Follow-Up Settings"
        description="SMS tracking field and popup text drip messages. Twilio sender details come from env vars."
        open={smsSectionOpen}
        onToggle={() => setSmsSectionOpen((value) => !value)}
        action={
          <button
            type="button"
            onClick={addSms}
            className="text-sm font-medium text-grove hover:text-forest transition-colors"
          >
            Add SMS Follow-up
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              Sent SMS Field Key
            </label>
            <input
              type="text"
              value={safeConfig.popupSentSmsFieldId || ""}
              onChange={(e) => updateField("popupSentSmsFieldId", e.target.value)}
              placeholder="popup_sent_sms"
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
          <div className="rounded-xl border border-sand bg-cream/50 p-4 text-xs text-forest/60">
            SMS sender values are env-only: <span className="font-mono">TWILIO_ACCOUNT_SID</span>, <span className="font-mono">TWILIO_AUTH_TOKEN</span>, and <span className="font-mono">TWILIO_FROM_NUMBER</span>.
          </div>
        </div>

        {sms.map((smsConfig, idx) => (
          <div key={`sms-${idx}`} className="rounded-xl border border-sand bg-cream/50 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-forest">{smsConfig.label || `SMS ${idx + 1}`}</span>
              <div className="flex items-center gap-3">
                <Toggle enabled={smsConfig.enabled !== false} onChange={(value) => updateSms(idx, "enabled", value)} />
                {sms.length > 1 ? <XButton onClick={() => removeSms(idx)} /> : null}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">Days After Trigger</label>
                <input
                  type="number"
                  min={0}
                  value={smsConfig.daysAfterTrigger}
                  onChange={(e) => updateSms(idx, "daysAfterTrigger", parseInt(e.target.value, 10) || 0)}
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </div>
              <div>
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">SMS Key</label>
                <input
                  type="text"
                  value={smsConfig.messageKey || ""}
                  onChange={(e) => updateSms(idx, "messageKey", e.target.value)}
                  placeholder="sms_day_2"
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </div>
              <div>
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">Label</label>
                <input
                  type="text"
                  value={smsConfig.label || ""}
                  onChange={(e) => updateSms(idx, "label", e.target.value)}
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">Message Body</label>
              <textarea
                rows={4}
                value={smsConfig.messageBody || ""}
                onChange={(e) => updateSms(idx, "messageBody", e.target.value)}
                placeholder="Your Zenfulcove reminder message..."
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>
          </div>
        ))}
      </CollapsibleSection>

      {testModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/35 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-sand p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-medium text-forest">Test Popup Drip</h3>
                <p className="text-sm text-forest/55 mt-1">
                  Run a dry run or send a one-off test without marking any real contact as sent.
                </p>
              </div>
              <button type="button" onClick={() => setTestModalOpen(false)} className="text-2xl leading-none text-forest/40 hover:text-forest">
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">Channel</label>
                <select
                  value={testChannel}
                  onChange={(e) => {
                    const nextChannel = e.target.value;
                    setTestChannel(nextChannel);
                    setTestDestination(testDestinations[nextChannel] || "");
                  }}
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                  {testChannel === "sms" ? "Test Phone Number" : "Test Email Address"}
                </label>
                <input
                  type="text"
                  value={testDestination}
                  onChange={(e) => setTestDestination(e.target.value)}
                  placeholder={testPlaceholder}
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </div>
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
