"use client";

import Toggle from "./Toggle";

const DEFAULT_EMAILS = [
  { daysBeforeCheckin: 3, templateId: "", label: "Original" },
  { daysBeforeCheckin: 2, templateId: "", label: "Reminder (2 days before)" },
  { daysBeforeCheckin: 1, templateId: "", label: "Reminder (1 day before)" },
  { daysBeforeCheckin: 0, templateId: "", label: "Reminder (morning of)" },
];

export default function WaiverPanel({ config, onChange }) {
  const safeConfig = config || {};
  const emails = safeConfig.emails || safeConfig.reminders || DEFAULT_EMAILS;

  function updateEnabled(enabled) {
    onChange({ ...safeConfig, enabled });
  }

  function updateJotformFormId(value) {
    onChange({ ...safeConfig, jotformFormId: value });
  }

  function updateEmail(index, field, value) {
    const list = [...emails];
    list[index] = { ...list[index], [field]: value };
    onChange({ ...safeConfig, emails: list });
  }

  function addEmail() {
    const list = [
      ...emails,
      { daysBeforeCheckin: 1, templateId: "", label: "Reminder" },
    ];
    onChange({ ...safeConfig, emails: list });
  }

  function removeEmail(index) {
    const list = emails.filter((_, i) => i !== index);
    onChange({ ...safeConfig, emails: list });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl text-forest">Jotform Waiver Emails</h2>
        <Toggle enabled={safeConfig.enabled} onChange={updateEnabled} />
      </div>

      <p className="text-sm text-forest/70">
        4 SendGrid templates — 1 original + 3 reminders. Same Jotform form in each. All editable below.
      </p>

      {/* Property filter — restrict to Zenfulcove properties only */}
      <div className="bg-white rounded-xl shadow-sm border border-sand p-5">
        <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
          Lodgify Property IDs (optional)
        </label>
        <input
          type="text"
          value={(safeConfig.propertyIds || []).join(", ")}
          onChange={(e) => {
            const ids = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            onChange({ ...safeConfig, propertyIds: ids });
          }}
          placeholder="e.g. 123, 456, 789 (leave empty for all properties)"
          className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
        />
        <p className="text-xs text-forest/40 mt-1">
          Restrict waiver emails to these Lodgify property IDs only. If empty, all
          properties in your Lodgify account are included (can cause 100+ emails).
        </p>
      </div>

      {/* Single Jotform Form ID — used for all 4 emails */}
      <div className="bg-white rounded-xl shadow-sm border border-sand p-5">
        <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
          Jotform Form ID
        </label>
        <input
          type="text"
          value={safeConfig.jotformFormId || (safeConfig.reminders && safeConfig.reminders[0]?.jotformFormId) || ""}
          onChange={(e) => updateJotformFormId(e.target.value)}
          placeholder="e.g. 251834442091050"
          className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
        />
        <p className="text-xs text-forest/40 mt-1">
          Same form used in all 4 emails. Editable from the dashboard.
        </p>
      </div>

      {/* 4 email templates */}
      <div className="space-y-4">
        {emails.map((e, idx) => (
          <div
            key={idx}
            className="bg-white rounded-xl shadow-sm border border-sand p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-forest">
                {e.label || `Email ${idx + 1}`}
              </span>
              {emails.length > 1 && (
                <button
                  onClick={() => removeEmail(idx)}
                  className="text-red-400 hover:text-red-600 transition-colors text-sm"
                  title="Remove this email"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                  </svg>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                  Days Before Check-in
                </label>
                <input
                  type="number"
                  min={0}
                  value={e.daysBeforeCheckin}
                  onChange={(ev) =>
                    updateEmail(
                      idx,
                      "daysBeforeCheckin",
                      parseInt(ev.target.value, 10) || 0
                    )
                  }
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
                <p className="text-xs text-forest/40 mt-0.5">
                  0 = morning of stay
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                  SendGrid Template ID
                </label>
                <input
                  type="text"
                  value={e.templateId || ""}
                  onChange={(ev) =>
                    updateEmail(idx, "templateId", ev.target.value)
                  }
                  placeholder="d-xxxxxxxx"
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </div>
            </div>
            <div className="mt-2">
              <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                Label
              </label>
              <input
                type="text"
                value={e.label || ""}
                onChange={(ev) => updateEmail(idx, "label", ev.target.value)}
                placeholder="e.g. Original, Reminder (2 days before)"
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addEmail}
        className="flex items-center gap-2 text-grove hover:text-forest text-sm font-medium transition-colors"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        Add Another Email
      </button>
    </div>
  );
}
