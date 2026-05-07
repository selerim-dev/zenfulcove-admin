"use client";

import SendGridListPicker from "./SendGridListPicker";
import Toggle from "./Toggle";

export default function JotformClientSyncPanel({ config, onChange }) {
  const safeConfig = config || {};

  function updateField(field, value) {
    onChange({ ...safeConfig, [field]: value });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl text-forest">Jotform Client Sync</h2>
        <Toggle
          enabled={safeConfig.enabled}
          onChange={(enabled) => updateField("enabled", enabled)}
        />
      </div>

      <p className="text-sm text-forest/70">
        Once per cron run, pull contacts from the selected Jotform form IDs and
        upsert them into your master SendGrid client list. Dry run logs every
        contact that would be synced before any write happens.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-4">
        <SendGridListPicker
          label="SendGrid Master List"
          value={safeConfig.sendgridContactListId || ""}
          onChange={(value) => updateField("sendgridContactListId", value)}
          helperText="Contacts from the configured Jotform submissions are upserted into this list."
        />

        <div>
          <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
            Jotform Form IDs
          </label>
          <textarea
            value={(safeConfig.jotformFormIds || []).join(", ")}
            onChange={(e) => {
              const ids = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              updateField("jotformFormIds", ids);
            }}
            placeholder="e.g. 251834442091050"
            rows={3}
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <p className="text-xs text-forest/40 mt-1">
            Comma-separated form IDs. The sync reads all submissions from each configured form.
          </p>
        </div>
      </div>
    </div>
  );
}
