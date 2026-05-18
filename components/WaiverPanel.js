"use client";

import { useEffect, useState } from "react";
import Toggle from "./Toggle";

const DEFAULT_EMAILS = [
  { daysBeforeCheckin: 2, templateId: "", label: "Reminder (2 days before)" },
  { daysBeforeCheckin: 1, templateId: "", label: "Reminder (1 day before)" },
  { daysBeforeCheckin: 0, templateId: "", label: "Reminder (morning of)" },
];

export default function WaiverPanel({
  config,
  onChange,
  accessCodeRelease,
  onAccessCodeReleaseChange,
}) {
  const safeConfig = config || {};
  const codeRelease = accessCodeRelease || {};
  const emails = safeConfig.emails || safeConfig.reminders || DEFAULT_EMAILS;
  const propertyCodesText = Object.entries(codeRelease.propertyCodes || {})
    .map(([property, code]) => `${property}: ${code}`)
    .join("\n");
  const [propertyMessageText, setPropertyMessageText] = useState("{}");
  const [propertyMessageError, setPropertyMessageError] = useState("");

  useEffect(() => {
    setPropertyMessageText(
      JSON.stringify(codeRelease.propertyMessageData || {}, null, 2)
    );
    setPropertyMessageError("");
  }, [codeRelease.propertyMessageData]);

  function updateEnabled(enabled) {
    onChange({ ...safeConfig, enabled });
  }

  function updateJotformFormId(value) {
    onChange({ ...safeConfig, jotformFormId: value });
  }

  function updateLocalFormSlug(value) {
    onChange({ ...safeConfig, localFormSlug: value });
  }

  function updateCodeRelease(field, value) {
    if (!onAccessCodeReleaseChange) return;
    onAccessCodeReleaseChange({ ...codeRelease, [field]: value });
  }

  function updateCodeReleasePropertyIds(value) {
    const propertyIds = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    updateCodeRelease("propertyIds", propertyIds);
  }

  function updatePropertyCodes(raw) {
    const propertyCodes = {};
    raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [property, ...codeParts] = line.split(":");
        const key = String(property || "").trim();
        const code = codeParts.join(":").trim();
        if (key && code) propertyCodes[key] = code;
      });
    updateCodeRelease("propertyCodes", propertyCodes);
  }

  function updatePropertyMessageData(raw) {
    setPropertyMessageText(raw);
    try {
      const parsed = raw.trim() ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Use a JSON object keyed by property name or Lodgify ID.");
      }
      setPropertyMessageError("");
      updateCodeRelease("propertyMessageData", parsed);
    } catch (err) {
      setPropertyMessageError(err.message || "Invalid JSON.");
    }
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
        <h2 className="font-serif text-2xl text-forest">Form Waiver Emails</h2>
        <Toggle enabled={safeConfig.enabled} onChange={updateEnabled} />
      </div>

      <p className="text-sm text-forest/70">
        Waiver reminders are sent for each “days before check-in” you configure below. Use an internal form slug to send guests to Zenfulcove-hosted forms; Jotform remains as a fallback during migration.
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
          properties in your Lodgify account are included.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-sand p-5">
        <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
          Internal Form Slug
        </label>
        <input
          type="text"
          value={safeConfig.localFormSlug || ""}
          onChange={(e) => updateLocalFormSlug(e.target.value)}
          placeholder="guest-info"
          className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
        />
        <p className="text-xs text-forest/40 mt-1">
          When set, reminders link to <span className="font-mono">/forms/[slug]</span> and check Supabase local form submissions for the booking ID.
        </p>
      </div>

      {/* Legacy Jotform Form ID fallback */}
      <div className="bg-white rounded-xl shadow-sm border border-sand p-5">
        <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
          Legacy Jotform Form ID
        </label>
        <input
          type="text"
          value={safeConfig.jotformFormId || (safeConfig.reminders && safeConfig.reminders[0]?.jotformFormId) || ""}
          onChange={(e) => updateJotformFormId(e.target.value)}
          placeholder="e.g. 251834442091050"
          className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
        />
        <p className="text-xs text-forest/40 mt-1">
          Used only when the internal form slug is blank, so the old Jotform reminder flow can keep running during migration.
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

      <div className="pt-4 border-t border-sand/70 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-2xl text-forest">
              Access Code Release
            </h2>
            <p className="text-sm text-forest/70 mt-1">
              Sends the stay access code once the waiver form is submitted and
              the configured check-in-day release time has passed.
            </p>
          </div>
          <Toggle
            enabled={Boolean(codeRelease.enabled)}
            onChange={(enabled) => updateCodeRelease("enabled", enabled)}
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                Release Hour Central
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={codeRelease.releaseHourCentral ?? 11}
                onChange={(e) =>
                  updateCodeRelease(
                    "releaseHourCentral",
                    Math.max(0, Math.min(23, Number(e.target.value || 0)))
                  )
                }
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>
            <div>
              <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                Minute
              </label>
              <input
                type="number"
                min={0}
                max={59}
                value={codeRelease.releaseMinuteCentral ?? 0}
                onChange={(e) =>
                  updateCodeRelease(
                    "releaseMinuteCentral",
                    Math.max(0, Math.min(59, Number(e.target.value || 0)))
                  )
                }
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>
            <div>
              <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                Internal Form Slug
              </label>
              <input
                type="text"
                value={codeRelease.localFormSlug ?? safeConfig.localFormSlug ?? ""}
                onChange={(e) => updateCodeRelease("localFormSlug", e.target.value)}
                placeholder="guest-info"
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              Template 1: SendGrid Code Template ID
            </label>
            <input
              type="text"
              value={codeRelease.sendgridTemplateId || ""}
              onChange={(e) =>
                updateCodeRelease("sendgridTemplateId", e.target.value)
              }
              placeholder="d-xxxxxxxx"
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
            <p className="text-xs text-forest/40 mt-1">
              Used when the form is complete. Template receives GuestFirstName,
              Arrival, Departure, KeyCode, wifiName, wifiPassword,
              reservationFormUrl, and accessMessageHtml.
            </p>
          </div>

          <div>
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              Template 2: Missing Form Template ID
            </label>
            <input
              type="text"
              value={codeRelease.missingFormTemplateId || ""}
              onChange={(e) =>
                updateCodeRelease("missingFormTemplateId", e.target.value)
              }
              placeholder="d-xxxxxxxx"
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
            <p className="text-xs text-forest/40 mt-1">
              Used on check-in day when the form is still missing. It receives
              the same stay data, but KeyCode is blank and reservationFormUrl is
              included.
            </p>
          </div>

          <div>
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              Property IDs
            </label>
            <input
              type="text"
              value={(codeRelease.propertyIds || []).join(", ")}
              onChange={(e) => updateCodeReleasePropertyIds(e.target.value)}
              placeholder="Leave blank for all properties"
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>

          <div>
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              Static Property Codes
            </label>
            <textarea
              value={propertyCodesText}
              onChange={(e) => updatePropertyCodes(e.target.value)}
              placeholder={"Doodle House: 1234\nDesert Rose: 1968"}
              rows={4}
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
            <p className="text-xs text-forest/40 mt-1">
              Use for units with fixed codes. Variable-code units use stored
              codes, Lodgify/Jervis payloads, or the Jervis webhook when
              available.
            </p>
          </div>

          <div>
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              Property Message Data
            </label>
            <textarea
              value={propertyMessageText}
              onChange={(e) => updatePropertyMessageData(e.target.value)}
              rows={12}
              spellCheck={false}
              className="border border-sand rounded-lg px-3 py-2 text-xs w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
            <p className="text-xs text-forest/40 mt-1">
              JSON keyed by property name or Lodgify property ID. Use it for
              wifiName, wifiPassword, displayName, directionsName,
              parkingInstructions, dedicatedKayakText, amenitiesText, and other
              property-specific message values.
            </p>
            {propertyMessageError ? (
              <p className="text-xs text-red-500 mt-1">
                {propertyMessageError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
