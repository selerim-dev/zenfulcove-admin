"use client";

import Toggle from "./Toggle";

const DEFAULT_EMAILS = [
  { daysAfterTrigger: 2, templateId: "", label: "Follow-up (2 days after)" },
  { daysAfterTrigger: 3, templateId: "", label: "Follow-up (3 days after)" },
  { daysAfterTrigger: 6, templateId: "", label: "Follow-up (6 days after)" },
];

export default function PopupFollowupsPanel({ config, onChange }) {
  const safeConfig = config || {};
  const emails = safeConfig.emails || DEFAULT_EMAILS;

  function updateEnabled(enabled) {
    onChange({ ...safeConfig, enabled });
  }

  function updateField(field, value) {
    onChange({ ...safeConfig, [field]: value });
  }

  function updateEmail(index, field, value) {
    const list = [...emails];
    list[index] = { ...list[index], [field]: value };
    onChange({ ...safeConfig, emails: list });
  }

  function addEmail() {
    const list = [
      ...emails,
      { daysAfterTrigger: 1, templateId: "", label: "Follow-up" },
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
        <h2 className="font-serif text-2xl text-forest">Popup Follow Ups</h2>
        <Toggle enabled={safeConfig.enabled} onChange={updateEnabled} />
      </div>

      <p className="text-sm text-forest/70">
        Contacts are sourced from a dedicated SendGrid list populated by the Wix
        popup automation. Follow-ups are sent only on exact day matches and only
        if that exact template ID has not already been recorded for the contact.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-sand p-5">
          <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
            SendGrid Contact List ID
          </label>
          <input
            type="text"
            value={safeConfig.sendgridContactListId || ""}
            onChange={(e) => updateField("sendgridContactListId", e.target.value)}
            placeholder="e.g. 44b5b3f5-d03d-4552-997f-8715a906d5b8"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <p className="text-xs text-forest/40 mt-1">
            Only contacts in this list are eligible for popup follow-ups.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-sand p-5">
          <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
            Triggered Date Field ID
          </label>
          <input
            type="text"
            value={safeConfig.popupTriggeredFieldId || ""}
            onChange={(e) => updateField("popupTriggeredFieldId", e.target.value)}
            placeholder="e.g. e1_D"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <p className="text-xs text-forest/40 mt-1">
            SendGrid custom field that stores when the popup first triggered.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-sand p-5 sm:col-span-2">
          <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
            Sent Templates Field ID
          </label>
          <input
            type="text"
            value={safeConfig.popupSentTemplatesFieldId || ""}
            onChange={(e) =>
              updateField("popupSentTemplatesFieldId", e.target.value)
            }
            placeholder="e.g. e2_T"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <p className="text-xs text-forest/40 mt-1">
            SendGrid custom field that stores the exact template IDs already sent
            to this popup lead.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {emails.map((emailConfig, idx) => (
          <div
            key={idx}
            className="bg-white rounded-xl shadow-sm border border-sand p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-forest">
                {emailConfig.label || `Follow-up ${idx + 1}`}
              </span>
              {emails.length > 1 && (
                <button
                  onClick={() => removeEmail(idx)}
                  className="text-red-400 hover:text-red-600 transition-colors text-sm"
                  title="Remove this follow-up"
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
                  Days After Trigger
                </label>
                <input
                  type="number"
                  min={0}
                  value={emailConfig.daysAfterTrigger}
                  onChange={(e) =>
                    updateEmail(
                      idx,
                      "daysAfterTrigger",
                      parseInt(e.target.value, 10) || 0
                    )
                  }
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                  SendGrid Template ID
                </label>
                <input
                  type="text"
                  value={emailConfig.templateId || ""}
                  onChange={(e) =>
                    updateEmail(idx, "templateId", e.target.value)
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
                value={emailConfig.label || ""}
                onChange={(e) => updateEmail(idx, "label", e.target.value)}
                placeholder="e.g. Reminder (2 days after)"
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
        Add Another Follow-up
      </button>
    </div>
  );
}
