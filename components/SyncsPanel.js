"use client";

import { useState } from "react";
import SendGridListPicker from "./SendGridListPicker";
import Toggle from "./Toggle";

function SyncCard({ title, description, enabled, onToggle, action, children }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-serif text-xl text-forest">{title}</h3>
          <p className="text-sm text-forest/70 mt-1">{description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {action}
          {onToggle ? <Toggle enabled={enabled} onChange={onToggle} /> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children }) {
  return (
    <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
      {children}
    </label>
  );
}

function statusColor(status) {
  switch (String(status || "").toLowerCase()) {
    case "success":
      return "text-grove";
    case "failed":
      return "text-red-600";
    case "skipped":
      return "text-forest/50";
    default:
      return "text-forest/70";
  }
}

function SalesmateSyncCard({ config, onChange }) {
  const safeConfig = config || {};
  const sourceListId = String(safeConfig.sourceListId || "").trim();

  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testLive, setTestLive] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState("");

  function setSourceListId(value) {
    onChange({ ...safeConfig, sourceListId: value });
  }

  function openTest() {
    setTestResult(null);
    setTestError("");
    setTestLive(false);
    setTestModalOpen(true);
  }

  async function runTest(dryRun) {
    if (!dryRun) {
      const ok = window.confirm(
        "This will create or update real Salesmate contacts for every contact in the source list whose tags have changed. Continue?"
      );
      if (!ok) return;
    }
    setTestRunning(true);
    setTestError("");
    setTestResult(null);
    setTestLive(!dryRun);
    try {
      const res = await fetch("/api/salesmate-form-sync-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, salesmateFormSync: safeConfig }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Salesmate form sync test failed.");
      setTestResult(data);
    } catch (err) {
      setTestError(err.message || "Salesmate form sync test failed.");
    } finally {
      setTestRunning(false);
    }
  }

  return (
    <SyncCard
      title="Salesmate Form Sync"
      description="Mirrors a single master SendGrid list into Salesmate. Each contact is auto-tagged with the names of every other SendGrid list they belong to — i.e. the forms they came from — in one Salesmate write per contact."
      enabled={Boolean(safeConfig.enabled)}
      onToggle={(enabled) => onChange({ ...safeConfig, enabled })}
      action={
        <button
          type="button"
          onClick={openTest}
          className="rounded-full border border-grove/30 px-4 py-2 text-sm font-medium text-grove hover:border-grove hover:text-forest transition-colors"
        >
          Test Sync
        </button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <SendGridListPicker
          label="Source SendGrid List"
          value={sourceListId}
          onChange={setSourceListId}
          helperText="Tags come from every other list each contact also belongs to. No per-list configuration needed."
        />
        <div>
          <FieldLabel>Salesmate Lead Source</FieldLabel>
          <input
            type="text"
            value={safeConfig.leadSource || "Website"}
            onChange={(e) => onChange({ ...safeConfig, leadSource: e.target.value })}
            placeholder="Website"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
        </div>
      </div>

      {testModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-forest/35 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-sand p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-medium text-forest">
                  Test Salesmate Form Sync
                </h3>
                <p className="text-sm text-forest/55 mt-1">
                  Dry Run inspects every selected list and reports what would be
                  created in Salesmate, without writing anything.
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

            {testError ? (
              <p className="text-sm text-red-600">{testError}</p>
            ) : null}

            {testResult ? (
              <div className="rounded-xl border border-sand bg-cream/50 p-4 space-y-1 max-h-96 overflow-auto">
                <div className="text-xs uppercase tracking-wider text-forest/50 mb-2">
                  {testLive ? "Live Run Result" : "Dry Run Result"} —{" "}
                  {testResult.status}
                </div>
                {(Array.isArray(testResult.logs) ? testResult.logs : []).map(
                  (log, index) => (
                    <div
                      key={`${log.timestamp}-${index}`}
                      className="text-xs font-mono text-forest/80 leading-relaxed"
                    >
                      <span className={`font-semibold ${statusColor(log.status)}`}>
                        [{String(log.status || "info").toUpperCase()}]
                      </span>{" "}
                      <span className="text-forest/50">({log.property})</span>{" "}
                      {log.action}
                    </div>
                  )
                )}
                {(!testResult.logs || testResult.logs.length === 0) && (
                  <div className="text-sm text-forest/60">No logs returned.</div>
                )}
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
                {testRunning && !testLive ? "Running..." : "Run Dry Run"}
              </button>
              <button
                type="button"
                disabled={testRunning}
                onClick={() => runTest(false)}
                className="rounded-full bg-grove px-4 py-2 text-sm font-medium text-white hover:bg-forest disabled:opacity-50"
              >
                {testRunning && testLive ? "Running..." : "Run Live Sync Now"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SyncCard>
  );
}

export default function SyncsPanel({
  jotformConfig,
  localFormConfig,
  lodgifyConfig,
  salesmateConfig,
  onChange,
}) {
  const safeJotformConfig = jotformConfig || {};
  const safeLocalFormConfig = localFormConfig || {};
  const safeLodgifyConfig = lodgifyConfig || {};
  const safeSalesmateConfig = salesmateConfig || {};

  function update(patch) {
    onChange({
      jotformClientSync: safeJotformConfig,
      localFormClientSync: safeLocalFormConfig,
      lodgifyClientSync: safeLodgifyConfig,
      salesmateFormSync: safeSalesmateConfig,
      ...patch,
    });
  }

  function updateJotform(field, value) {
    update({ jotformClientSync: { ...safeJotformConfig, [field]: value } });
  }

  function updateLocalForm(field, value) {
    update({ localFormClientSync: { ...safeLocalFormConfig, [field]: value } });
  }

  function updateLodgify(field, value) {
    update({ lodgifyClientSync: { ...safeLodgifyConfig, [field]: value } });
  }

  function updateSalesmate(updated) {
    update({ salesmateFormSync: updated });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-serif text-2xl text-forest">Syncs</h2>
        <p className="text-sm text-forest/70">
          Sync guest contact data from external systems into SendGrid (and onward
          into Salesmate) so follow-up automations can use the most complete
          email and phone records available. Activity Log below shows all syncs
          together with the rest of the system.
        </p>
      </div>

      <SyncCard
        title="Jotform Client Sync"
        description="Pull contacts from Jotform submissions and upsert them into your master SendGrid client list."
        enabled={safeJotformConfig.enabled}
        onToggle={(enabled) => updateJotform("enabled", enabled)}
      >
        <SendGridListPicker
          label="SendGrid Master List"
          value={safeJotformConfig.sendgridContactListId || ""}
          onChange={(value) => updateJotform("sendgridContactListId", value)}
        />

        <div>
          <FieldLabel>Jotform Form IDs</FieldLabel>
          <textarea
            value={(safeJotformConfig.jotformFormIds || []).join(", ")}
            onChange={(e) => {
              const ids = e.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
              updateJotform("jotformFormIds", ids);
            }}
            placeholder="e.g. 251834442091050"
            rows={3}
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <p className="text-xs text-forest/40 mt-1">
            Comma-separated form IDs. All submissions from each listed form are read on every sync run.
          </p>
        </div>
      </SyncCard>

      <SyncCard
        title="Local Form Client Sync"
        description="Pull contacts from Zenfulcove-hosted form submissions in Supabase and upsert them into your master SendGrid client list. This is the replacement path for Jotform."
        enabled={safeLocalFormConfig.enabled}
        onToggle={(enabled) => updateLocalForm("enabled", enabled)}
      >
        <SendGridListPicker
          label="SendGrid Master List"
          value={safeLocalFormConfig.sendgridContactListId || ""}
          onChange={(value) => updateLocalForm("sendgridContactListId", value)}
          helperText="Usually this should be the same master client list used by the Jotform sync."
        />

        <div>
          <FieldLabel>Local Form Slugs</FieldLabel>
          <textarea
            value={(safeLocalFormConfig.formSlugs || []).join(", ")}
            onChange={(e) => {
              const slugs = e.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
              updateLocalForm("formSlugs", slugs);
            }}
            placeholder="guest-info"
            rows={3}
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <p className="text-xs text-forest/40 mt-1">
            Comma-separated slugs from <span className="font-mono">local_forms</span>. Leave blank to sync every local form submission.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-sand px-4 py-3">
          <div>
            <p className="text-sm font-medium text-forest">Only Unsynced Submissions</p>
            <p className="text-xs text-forest/50 mt-1">
              Off matches the current Jotform behavior by re-upserting all contacts each run.
            </p>
          </div>
          <Toggle
            enabled={safeLocalFormConfig.onlyUnsynced === true}
            onChange={(enabled) => updateLocalForm("onlyUnsynced", enabled)}
          />
        </div>
      </SyncCard>

      <SyncCard
        title="Lodgify Client Sync"
        description="Pull guest contacts from Lodgify bookings and upsert them into SendGrid, including bookings that later cancel when Lodgify still exposes the guest record."
        enabled={safeLodgifyConfig.enabled}
        onToggle={(enabled) => updateLodgify("enabled", enabled)}
      >
        <SendGridListPicker
          label="SendGrid Master List"
          value={safeLodgifyConfig.sendgridContactListId || ""}
          onChange={(value) => updateLodgify("sendgridContactListId", value)}
          helperText="Usually this should be the same master client list used by the Jotform sync."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>Stay-Date Lookback (Days)</FieldLabel>
            <input
              type="number"
              min="0"
              value={safeLodgifyConfig.stayDateLookbackDays ?? 30}
              onChange={(e) =>
                updateLodgify("stayDateLookbackDays", Number(e.target.value || 0))
              }
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
          <div>
            <FieldLabel>Stay-Date Lookahead (Days)</FieldLabel>
            <input
              type="number"
              min="0"
              value={safeLodgifyConfig.stayDateLookaheadDays ?? 365}
              onChange={(e) =>
                updateLodgify("stayDateLookaheadDays", Number(e.target.value || 0))
              }
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-sand px-4 py-3">
          <div>
            <p className="text-sm font-medium text-forest">Include Cancelled Bookings</p>
            <p className="text-xs text-forest/50 mt-1">
              Keeps canceled bookings eligible for lead capture when Lodgify still returns their guest contact data.
            </p>
          </div>
          <Toggle
            enabled={safeLodgifyConfig.includeCancelledBookings !== false}
            onChange={(enabled) => updateLodgify("includeCancelledBookings", enabled)}
          />
        </div>
      </SyncCard>

      <SalesmateSyncCard config={safeSalesmateConfig} onChange={updateSalesmate} />
    </div>
  );
}
