"use client";

import { useEffect, useState } from "react";
import Toggle from "./Toggle";

const KNOWN_UNITS = [
  { id: "608952", name: "Fairy House" },
  { id: "608953", name: "Desert Rose" },
  { id: "608954", name: "Sky Castle" },
  { id: "608955", name: "Bird House" },
  { id: "754651", name: "Doodle House" },
];

const DEFAULT_EMAILS = [
  { daysBeforeCheckin: 2, templateId: "", label: "Reminder (2 days before)" },
  { daysBeforeCheckin: 1, templateId: "", label: "Reminder (1 day before)" },
  { daysBeforeCheckin: 0, templateId: "", label: "Reminder (morning of)" },
];

const TEMPLATE_VARIABLES = [
  "GuestFirstName",
  "GuestName",
  "Arrival",
  "Departure",
  "KeyCode",
  "propertyDisplayName",
  "wifiName",
  "wifiPassword",
  "reservationFormUrl",
  "waiverUrl",
  "accessMessageHtml",
  "accessMessageText",
  "dedicatedKayakText",
  "amenitiesText",
];

const PROPERTY_MESSAGE_FIELDS = [
  { key: "displayName", label: "Display Name", placeholder: "SKY CASTLE" },
  { key: "directionsName", label: "Directions Name", placeholder: "SKY CASTLE" },
  { key: "wifiName", label: "Wi-Fi Name", placeholder: "SKYCASTLE" },
  { key: "wifiPassword", label: "Wi-Fi Password", placeholder: "Iamgrateful!" },
  {
    key: "kayakLockCode",
    label: "Kayak Lock Code",
    placeholder: "1010",
  },
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
  const jervisPropertyIdsText = Object.entries(codeRelease.jervisPropertyIds || {})
    .map(([property, id]) => `${property}: ${id}`)
    .join("\n");
  const [propertyMessageText, setPropertyMessageText] = useState("{}");
  const [propertyMessageError, setPropertyMessageError] = useState("");
  const [lodgifyProperties, setLodgifyProperties] = useState([]);
  const [lodgifyPropertiesStatus, setLodgifyPropertiesStatus] = useState("idle");

  useEffect(() => {
    setPropertyMessageText(
      JSON.stringify(codeRelease.propertyMessageData || {}, null, 2)
    );
    setPropertyMessageError("");
  }, [codeRelease.propertyMessageData]);

  useEffect(() => {
    let active = true;
    setLodgifyPropertiesStatus("loading");
    fetch("/api/lodgify/properties")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) throw new Error(data.error || "Failed to load Lodgify properties.");
        setLodgifyProperties(Array.isArray(data.properties) ? data.properties : []);
        setLodgifyPropertiesStatus("loaded");
      })
      .catch(() => {
        if (!active) return;
        setLodgifyPropertiesStatus("failed");
      });

    return () => {
      active = false;
    };
  }, []);

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

  function setPropertyCode(key, code) {
    const propertyCodes = { ...(codeRelease.propertyCodes || {}) };
    const normalizedCode = String(code || "").trim();
    if (normalizedCode) {
      propertyCodes[key] = normalizedCode;
    } else {
      delete propertyCodes[key];
    }
    updateCodeRelease("propertyCodes", propertyCodes);
  }

  function updateJervisPropertyIds(raw) {
    const jervisPropertyIds = {};
    raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [property, ...idParts] = line.split(":");
        const key = String(property || "").trim();
        const id = idParts.join(":").trim();
        if (key && id) jervisPropertyIds[key] = id;
      });
    updateCodeRelease("jervisPropertyIds", jervisPropertyIds);
  }

  function setJervisPropertyId(key, id) {
    const jervisPropertyIds = { ...(codeRelease.jervisPropertyIds || {}) };
    const normalizedId = String(id || "").trim();
    if (normalizedId) {
      jervisPropertyIds[key] = normalizedId;
    } else {
      delete jervisPropertyIds[key];
    }
    updateCodeRelease("jervisPropertyIds", jervisPropertyIds);
  }

  function updatePropertyMessageField(key, field, value) {
    const propertyMessageData = { ...(codeRelease.propertyMessageData || {}) };
    const current =
      propertyMessageData[key] && typeof propertyMessageData[key] === "object"
        ? { ...propertyMessageData[key] }
        : {};
    const normalizedValue = String(value || "").trim();
    if (normalizedValue) {
      current[field] = normalizedValue;
    } else {
      delete current[field];
    }
    if (Object.keys(current).length > 0) {
      propertyMessageData[key] = current;
    } else {
      delete propertyMessageData[key];
    }
    updateCodeRelease("propertyMessageData", propertyMessageData);
  }

  function updateCodeSource(key, source) {
    const propertyMessageData = { ...(codeRelease.propertyMessageData || {}) };
    const current =
      propertyMessageData[key] && typeof propertyMessageData[key] === "object"
        ? { ...propertyMessageData[key] }
        : {};
    current.codeSource = source;
    propertyMessageData[key] = current;
    const propertyCodes = { ...(codeRelease.propertyCodes || {}) };
    if (source === "jervis") {
      delete propertyCodes[key];
    }
    onAccessCodeReleaseChange?.({
      ...codeRelease,
      propertyMessageData,
      propertyCodes,
    });
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

  function internalFormSlug() {
    return String(safeConfig.localFormSlug || "")
      .trim()
      .replace(/^\/?forms\//, "");
  }

  function codeReleaseFormSlug() {
    return String(codeRelease.localFormSlug ?? internalFormSlug())
      .trim()
      .replace(/^\/?forms\//, "");
  }

  function mergedPropertyRows() {
    const rows = new Map();
    const addRow = (property) => {
      const name = String(property.name || "").trim();
      const id = String(property.id || "").trim();
      const matchingById = id
        ? Array.from(rows.values()).find((row) => row.id === id)
        : null;
      if (matchingById) {
        rows.set(matchingById.key, {
          ...matchingById,
          id,
          lodgifyName: name || matchingById.lodgifyName || "",
        });
        return;
      }
      const key = name || id;
      if (!key) return;
      const existing = rows.get(key) || {};
      rows.set(key, {
        key,
        id: id || existing.id || "",
        name: name || existing.name || key,
      });
    };

    KNOWN_UNITS.forEach(addRow);
    lodgifyProperties.forEach(addRow);
    Object.keys(codeRelease.propertyMessageData || {}).forEach((key) =>
      addRow({ name: key })
    );
    Object.keys(codeRelease.propertyCodes || {}).forEach((key) =>
      addRow({ name: key })
    );
    Object.keys(codeRelease.jervisPropertyIds || {}).forEach((key) =>
      addRow({ name: key })
    );

    return Array.from(rows.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  const formSlug = internalFormSlug();
  const formUrl = formSlug ? `/forms/${formSlug}` : "";
  const accessFormSlug = codeReleaseFormSlug();
  const propertyRows = mergedPropertyRows();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl text-forest">Waiver Reminders</h2>
        <Toggle enabled={safeConfig.enabled} onChange={updateEnabled} />
      </div>

      <p className="text-sm text-forest/70">
        Waiver reminders send 2, 1, and 0 days before check-in only when the
        guest has not submitted the internal form. Jotform is only a fallback
        if the internal form route is blank.
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
          Internal Form Route
        </label>
        <input
          type="text"
          value={safeConfig.localFormSlug || ""}
          onChange={(e) => updateLocalFormSlug(e.target.value)}
          placeholder="guest-info"
          className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
        />
        <p className="text-xs text-forest/40 mt-1">
          {formUrl ? (
            <>
              Reminder templates receive{" "}
              <span className="font-mono">waiverUrl</span> as{" "}
              <span className="font-mono">{formUrl}</span>. The cron checks
              Supabase internal form submissions for the booking ID before
              sending reminders.
            </>
          ) : (
            "Set this to use internal forms. If blank, the legacy Jotform URL is used."
          )}
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
                Internal Form Route
              </label>
              <input
                type="text"
                value={codeRelease.localFormSlug ?? safeConfig.localFormSlug ?? ""}
                onChange={(e) => updateCodeRelease("localFormSlug", e.target.value)}
                placeholder="guest-info"
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
              <p className="text-xs text-forest/40 mt-1">
                {accessFormSlug ? `/forms/${accessFormSlug}` : "Uses the waiver reminder form route."}
              </p>
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

          <div className="rounded-lg border border-sand/80 bg-cream/40 p-4">
            <h3 className="text-sm font-semibold text-forest">
              SendGrid Template Variables
            </h3>
            <p className="text-xs text-forest/50 mt-1">
              Use these dynamic template keys in Template 1 and Template 2.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              {TEMPLATE_VARIABLES.map((variable) => (
                <span
                  key={variable}
                  className="rounded border border-sand bg-white px-2 py-1 font-mono text-forest/80"
                >
                  {`{{${variable}}}`}
                </span>
              ))}
            </div>
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

          <div className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-forest">
                  Property Message Settings
                </h3>
                <p className="text-xs text-forest/50">
                  Seeded from Lodgify when available. Values here feed the
                  SendGrid variables and decide whether the access code is
                  static or generated by Jervis.
                </p>
              </div>
              <span className="text-xs text-forest/40">
                Lodgify:{" "}
                {lodgifyPropertiesStatus === "loaded"
                  ? `${lodgifyProperties.length} loaded`
                  : lodgifyPropertiesStatus === "loading"
                    ? "loading"
                    : "using fallback units"}
              </span>
            </div>

            <div className="space-y-4">
              {propertyRows.map((property) => {
                const key = property.key;
                const messageData =
                  codeRelease.propertyMessageData?.[key] &&
                  typeof codeRelease.propertyMessageData[key] === "object"
                    ? codeRelease.propertyMessageData[key]
                    : {};
                const staticCode = codeRelease.propertyCodes?.[key] || "";
                const jervisId = codeRelease.jervisPropertyIds?.[key] || "";
                const codeSource = messageData.codeSource || (staticCode ? "static" : "jervis");

                return (
                  <div
                    key={key}
                    className="rounded-lg border border-sand/80 bg-white p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-forest">
                          {property.name}
                        </h4>
                        {property.id ? (
                          <p className="text-xs text-forest/40">
                            Lodgify property ID:{" "}
                            <span className="font-mono">{property.id}</span>
                            {property.lodgifyName &&
                            property.lodgifyName !== property.name
                              ? ` · ${property.lodgifyName}`
                              : ""}
                          </p>
                        ) : null}
                      </div>
                      <label className="text-xs text-forest/60">
                        Code Source
                        <select
                          value={codeSource}
                          onChange={(event) =>
                            updateCodeSource(key, event.target.value)
                          }
                          className="mt-1 block rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                        >
                          <option value="jervis">Jervis dynamic</option>
                          <option value="static">Static code</option>
                        </select>
                      </label>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {PROPERTY_MESSAGE_FIELDS.map((field) => (
                        <label
                          key={field.key}
                          className="text-xs text-forest/60"
                        >
                          {field.label}
                          <input
                            type="text"
                            value={messageData[field.key] || ""}
                            onChange={(event) =>
                              updatePropertyMessageField(
                                key,
                                field.key,
                                event.target.value
                              )
                            }
                            placeholder={field.placeholder}
                            className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                          />
                        </label>
                      ))}
                      <label className="text-xs text-forest/60">
                        Jervis Property ID
                        <input
                          type="text"
                          value={jervisId}
                          onChange={(event) =>
                            setJervisPropertyId(key, event.target.value)
                          }
                          placeholder="33782"
                          className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm font-mono text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                        />
                      </label>
                      <label className="text-xs text-forest/60">
                        Static Access Code
                        <input
                          type="text"
                          value={staticCode}
                          onChange={(event) =>
                            setPropertyCode(key, event.target.value)
                          }
                          placeholder="Only for fixed-code units"
                          className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm font-mono text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                        />
                      </label>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <label className="text-xs text-forest/60">
                        Parking Instructions
                        <textarea
                          value={messageData.parkingInstructions || ""}
                          onChange={(event) =>
                            updatePropertyMessageField(
                              key,
                              "parkingInstructions",
                              event.target.value
                            )
                          }
                          placeholder="Parking - please park in front of your unit..."
                          rows={2}
                          className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                        />
                      </label>
                      <label className="text-xs text-forest/60">
                        Dedicated Kayak Text
                        <textarea
                          value={messageData.dedicatedKayakText || ""}
                          onChange={(event) =>
                            updatePropertyMessageField(
                              key,
                              "dedicatedKayakText",
                              event.target.value
                            )
                          }
                          placeholder="There is one dedicated kayak for this unit..."
                          rows={2}
                          className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                        />
                      </label>
                      <label className="text-xs text-forest/60">
                        Additional Kayak Text
                        <textarea
                          value={messageData.additionalKayakText || ""}
                          onChange={(event) =>
                            updatePropertyMessageField(
                              key,
                              "additionalKayakText",
                              event.target.value
                            )
                          }
                          placeholder="We have additional kayaks available..."
                          rows={2}
                          className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                        />
                      </label>
                      <label className="text-xs text-forest/60">
                        Amenities Text
                        <textarea
                          value={messageData.amenitiesText || ""}
                          onChange={(event) =>
                            updatePropertyMessageField(
                              key,
                              "amenitiesText",
                              event.target.value
                            )
                          }
                          placeholder="Mention unit-specific amenities or arrival notes..."
                          rows={2}
                          className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                Jervis API Base URL
              </label>
              <input
                type="text"
                value={codeRelease.jervisApiBaseUrl || ""}
                onChange={(e) =>
                  updateCodeRelease("jervisApiBaseUrl", e.target.value)
                }
                placeholder="https://www.jervis.systems/api/v1"
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>
            <div>
              <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                Jervis Account UUID
              </label>
              <input
                type="text"
                value={codeRelease.jervisAccountUuid || ""}
                onChange={(e) =>
                  updateCodeRelease("jervisAccountUuid", e.target.value)
                }
                placeholder="6a08e49c-a62d-53e0-bba5-20121b2456e4"
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                Jervis Access Start Time
              </label>
              <input
                type="text"
                value={codeRelease.jervisAccessStartTime || ""}
                onChange={(e) =>
                  updateCodeRelease("jervisAccessStartTime", e.target.value)
                }
                placeholder="15:00:00"
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>
            <div>
              <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                Jervis Access End Time
              </label>
              <input
                type="text"
                value={codeRelease.jervisAccessEndTime || ""}
                onChange={(e) =>
                  updateCodeRelease("jervisAccessEndTime", e.target.value)
                }
                placeholder="11:00:00"
                className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
              Jervis Property IDs
            </label>
            <textarea
              value={jervisPropertyIdsText}
              onChange={(e) => updateJervisPropertyIds(e.target.value)}
              placeholder={"Sky Castle: 33782\nFairy House: 33783\nBird House: 33784"}
              rows={4}
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
            <p className="text-xs text-forest/40 mt-1">
              Optional map from Lodgify property ID/name to Jervis property ID.
              If blank, the backend tries to match Jervis properties by
              platform_property_id or title. Store the token only as
              JERVIS_API_TOKEN in Vercel.
            </p>
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
