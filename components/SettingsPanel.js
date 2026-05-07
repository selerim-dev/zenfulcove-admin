"use client";

import SendGridListPicker from "./SendGridListPicker";

export default function SettingsPanel({ config, onChange }) {
  const sg = config || {};

  function update(field, value) {
    onChange({ ...sg, [field]: value });
  }

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl text-forest">Shared Settings</h2>
      <p className="text-sm text-forest/70">
        Used by all automations. Edit once, applies everywhere.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-4">
        <div>
          <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
            From Email
          </label>
          <input
            type="email"
            value={sg.fromEmail || ""}
            onChange={(e) => update("fromEmail", e.target.value)}
            placeholder="contact@zenfulcove.com"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
        </div>
        <div>
          <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
            From Name
          </label>
          <input
            type="text"
            value={sg.fromName || ""}
            onChange={(e) => update("fromName", e.target.value)}
            placeholder="Zenfulcove"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
        </div>
        <SendGridListPicker
          label="SendGrid Contact List"
          value={sg.sendgridContactListId || ""}
          onChange={(value) => update("sendgridContactListId", value)}
          helperText="Shared contact list used by vacancy promo emails and other automations."
        />
      </div>
    </div>
  );
}
