"use client";

import { useEffect, useMemo, useState } from "react";
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

const SIMPLE_PROPERTY_FIELDS = [
  { key: "displayName", label: "Display name", placeholder: "SKY CASTLE" },
  { key: "directionsName", label: "Sign / directions name", placeholder: "SKY CASTLE" },
  { key: "wifiName", label: "Wi-Fi network", placeholder: "SKYCASTLE" },
  { key: "wifiPassword", label: "Wi-Fi password", placeholder: "Iamgrateful!" },
  { key: "kayakLockCode", label: "Kayak lock code", placeholder: "1010" },
];

const LONG_PROPERTY_FIELDS = [
  {
    key: "unitDirections",
    label: "Arrival directions",
    placeholder: 'Once you are at Zenfulcove, follow the signs to the "SKY CASTLE"',
    rows: 2,
  },
  {
    key: "parkingInstructions",
    label: "Parking instructions",
    placeholder: "Parking - please park in front of your unit on the white gravel driveway.",
    rows: 2,
  },
  {
    key: "dedicatedKayakText",
    label: "Dedicated kayak text",
    placeholder: "There is one dedicated kayak for this unit...",
    rows: 3,
  },
  {
    key: "additionalKayakText",
    label: "Additional kayak text",
    placeholder: "We have additional kayaks available...",
    rows: 3,
  },
  {
    key: "amenitiesText",
    label: "Amenities text",
    placeholder: "Mention unit-specific amenities or arrival notes...",
    rows: 3,
  },
  {
    key: "additionalRulesText",
    label: "Additional rules text",
    placeholder: "Add unit-specific notes or leave blank to use the default.",
    rows: 3,
  },
];

function normalizeFormSlug(value) {
  return String(value || "")
    .trim()
    .replace(/^\/?forms\//, "");
}

function normalizeLookupKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function findMapEntry(map, property) {
  if (!map || typeof map !== "object" || !property) return null;
  const candidates = [
    property.key,
    property.id,
    property.name,
    normalizeLookupKey(property.key),
    normalizeLookupKey(property.id),
    normalizeLookupKey(property.name),
  ].filter(Boolean);

  for (const key of candidates) {
    if (map[key] !== undefined) return { key, value: map[key] };
  }

  for (const [key, value] of Object.entries(map)) {
    const normalizedKey = normalizeLookupKey(key);
    if (
      candidates.some(
        (candidate) =>
          candidate === normalizedKey ||
          candidate.includes(normalizedKey) ||
          normalizedKey.includes(candidate)
      )
    ) {
      return { key, value };
    }
  }

  return null;
}

function Chevron({ open }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${open ? "rotate-90" : ""}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function TrashIcon() {
  return (
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
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-xl border border-sand bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CollapsibleSection({ title, description, badge, open, onToggle, children }) {
  return (
    <section className="rounded-xl border border-sand bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-serif text-xl text-forest">{title}</h3>
            {badge ? (
              <span className="rounded-full border border-sand bg-cream px-2.5 py-1 text-[11px] font-medium text-forest/70">
                {badge}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-forest/60">{description}</p>
          ) : null}
        </div>
        <span className="rounded-full border border-sand p-2 text-forest/60">
          <Chevron open={open} />
        </span>
      </button>
      {open ? <div className="border-t border-sand/70 p-5">{children}</div> : null}
    </section>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", mono = false, helper }) {
  return (
    <label className="block text-xs text-forest/60">
      <span className="uppercase tracking-wider">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30 ${
          mono ? "font-mono" : ""
        }`}
      />
      {helper ? <span className="mt-1 block text-xs text-forest/40">{helper}</span> : null}
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <label className="block text-xs text-forest/60">
      <span className="uppercase tracking-wider">{label}</span>
      <textarea
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="mt-1 block w-full rounded-lg border border-sand px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
      />
    </label>
  );
}

function SegmentButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-grove text-white shadow-sm"
          : "text-forest/70 hover:bg-cream hover:text-forest"
      }`}
    >
      {children}
    </button>
  );
}

export default function WaiverPanel({
  config,
  onChange,
  accessCodeRelease,
  onAccessCodeReleaseChange,
}) {
  const safeConfig = config || {};
  const codeRelease = accessCodeRelease || {};
  const emails = safeConfig.emails || safeConfig.reminders || DEFAULT_EMAILS;
  const currentFormSlug = normalizeFormSlug(
    safeConfig.localFormSlug || codeRelease.localFormSlug
  );

  const [formMode, setFormMode] = useState(currentFormSlug ? "internal" : "jotform");
  const [remindersOpen, setRemindersOpen] = useState(true);
  const [accessOpen, setAccessOpen] = useState(true);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [lodgifyProperties, setLodgifyProperties] = useState([]);
  const [lodgifyPropertiesStatus, setLodgifyPropertiesStatus] = useState("loading");
  const [selectedPropertyKey, setSelectedPropertyKey] = useState("");

  useEffect(() => {
    let active = true;
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

  const propertyRows = useMemo(() => {
    const rows = new Map();
    const addRow = (property) => {
      const name = String(property.name || property.title || "").trim();
      const id = String(property.id || property.property_id || "").trim();
      const key = name || id;
      if (!key) return;
      const normalizedKey = normalizeLookupKey(key);
      const matching = Array.from(rows.values()).find((row) => {
        const rowValues = [row.key, row.id, row.name].map(normalizeLookupKey);
        return rowValues.some(
          (value) =>
            value &&
            (value === normalizedKey ||
              value.includes(normalizedKey) ||
              normalizedKey.includes(value))
        );
      });
      const rowKey = matching?.key || key;
      const existing = rows.get(rowKey) || matching || {};
      rows.set(rowKey, {
        key: rowKey,
        id: id || existing.id || "",
        name: name && !/^\d+$/.test(name) ? name : existing.name || key,
      });
    };

    KNOWN_UNITS.forEach(addRow);
    lodgifyProperties.forEach(addRow);
    Object.keys(codeRelease.propertyMessageData || {}).forEach((key) => addRow({ name: key }));
    Object.keys(codeRelease.propertyCodes || {}).forEach((key) => addRow({ name: key }));

    return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [
    lodgifyProperties,
    codeRelease.propertyMessageData,
    codeRelease.propertyCodes,
  ]);

  const selectedProperty =
    propertyRows.find((property) => property.key === selectedPropertyKey) || propertyRows[0];
  const selectedKey = selectedProperty?.key || "";
  const selectedMessageEntry = findMapEntry(
    codeRelease.propertyMessageData,
    selectedProperty
  );
  const selectedCodeEntry = findMapEntry(codeRelease.propertyCodes, selectedProperty);
  const selectedConfigKey = selectedMessageEntry?.key || selectedKey;
  const selectedCodeKey = selectedCodeEntry?.key || selectedConfigKey;
  const selectedMessageData =
    selectedMessageEntry?.value && typeof selectedMessageEntry.value === "object"
      ? selectedMessageEntry.value
      : {};
  const selectedStaticCode = selectedCodeEntry?.value || "";
  const selectedCodeSource =
    selectedMessageData.codeSource || (selectedStaticCode ? "static" : "jervis");
  const reminderFormUrl = currentFormSlug ? `/forms/${currentFormSlug}` : "";
  const activeReminderCount = emails.filter((email) => email.templateId).length;
  const propertyStatusLabel =
    lodgifyPropertiesStatus === "loaded"
      ? `${lodgifyProperties.length} Lodgify loaded`
      : lodgifyPropertiesStatus === "loading"
        ? "Loading Lodgify"
        : "Fallback property list";

  function updateEnabled(enabled) {
    onChange({ ...safeConfig, enabled });
  }

  function updateJotformFormId(value) {
    onChange({ ...safeConfig, jotformFormId: value });
    onAccessCodeReleaseChange?.({ ...codeRelease, jotformFormId: value });
  }

  function updateLocalFormSlug(value) {
    const normalized = normalizeFormSlug(value);
    setFormMode("internal");
    onChange({ ...safeConfig, localFormSlug: normalized });
    onAccessCodeReleaseChange?.({ ...codeRelease, localFormSlug: normalized });
  }

  function selectFormMode(mode) {
    setFormMode(mode);
    if (mode === "jotform") {
      onChange({ ...safeConfig, localFormSlug: "" });
      onAccessCodeReleaseChange?.({ ...codeRelease, localFormSlug: "" });
    }
  }

  function updateCodeRelease(field, value) {
    onAccessCodeReleaseChange?.({ ...codeRelease, [field]: value });
  }

  function updatePropertyMessageField(key, field, value) {
    const propertyMessageData = { ...(codeRelease.propertyMessageData || {}) };
    const current =
      propertyMessageData[key] && typeof propertyMessageData[key] === "object"
        ? { ...propertyMessageData[key] }
        : {};
    const next = String(value || "");
    if (next.trim()) {
      current[field] = next;
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

  function updateCodeSource(key, source) {
    const propertyMessageData = { ...(codeRelease.propertyMessageData || {}) };
    const current =
      propertyMessageData[key] && typeof propertyMessageData[key] === "object"
        ? { ...propertyMessageData[key] }
        : {};
    current.codeSource = source;
    propertyMessageData[key] = current;

    const propertyCodes = { ...(codeRelease.propertyCodes || {}) };
    if (source === "jervis") delete propertyCodes[key];

    onAccessCodeReleaseChange?.({
      ...codeRelease,
      propertyMessageData,
      propertyCodes,
    });
  }

  function updateEmail(index, field, value) {
    const list = [...emails];
    list[index] = { ...list[index], [field]: value };
    onChange({ ...safeConfig, emails: list });
  }

  function addEmail() {
    onChange({
      ...safeConfig,
      emails: [...emails, { daysBeforeCheckin: 1, templateId: "", label: "Reminder" }],
    });
  }

  function removeEmail(index) {
    onChange({ ...safeConfig, emails: emails.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl text-forest">Waiver Reminders</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-forest/70">
            This controls the guest form reminders and the check-in-day access
            code email. Operational routing is hidden here; staff only needs the
            form source, templates, and property-specific message values.
          </p>
        </div>
        <Toggle enabled={safeConfig.enabled} onChange={updateEnabled} />
      </div>

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-serif text-xl text-forest">Reservation form source</h3>
            <p className="mt-1 text-sm text-forest/60">
              Pick the form system for reminder links and access-code gating.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-sand bg-white p-1">
            <SegmentButton
              active={formMode === "internal"}
              onClick={() => selectFormMode("internal")}
            >
              Internal form
            </SegmentButton>
            <SegmentButton
              active={formMode === "jotform"}
              onClick={() => selectFormMode("jotform")}
            >
              Legacy Jotform
            </SegmentButton>
          </div>
        </div>

        {formMode === "internal" ? (
          <Field
            label="Internal form route"
            value={currentFormSlug}
            onChange={updateLocalFormSlug}
            placeholder="guest-info"
            mono
            helper={
              reminderFormUrl
                ? `Guests receive ${reminderFormUrl}. Jotform remains saved as fallback data but is not used while this route is set.`
                : "Enter the published internal form slug, without /forms/."
            }
          />
        ) : (
          <Field
            label="Legacy Jotform form ID"
            value={
              safeConfig.jotformFormId ||
              (safeConfig.reminders && safeConfig.reminders[0]?.jotformFormId) ||
              ""
            }
            onChange={updateJotformFormId}
            placeholder="251834442091050"
            mono
            helper="Used only while Legacy Jotform is selected."
          />
        )}
      </Card>

      <CollapsibleSection
        title="Reminder emails"
        description="Sent 2, 1, and 0 days before check-in when the guest has not completed the selected form."
        badge={`${activeReminderCount}/${emails.length} templates set`}
        open={remindersOpen}
        onToggle={() => setRemindersOpen((value) => !value)}
      >
        <div className="space-y-4">
          {emails.map((email, index) => (
            <div key={index} className="rounded-xl border border-sand/80 bg-cream/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-forest">
                  {email.label || `Reminder ${index + 1}`}
                </span>
                {emails.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeEmail(index)}
                    className="rounded-lg p-2 text-red-400 transition hover:bg-white hover:text-red-600"
                    title="Remove this reminder"
                  >
                    <TrashIcon />
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr]">
                <Field
                  label="Days before check-in"
                  type="number"
                  value={email.daysBeforeCheckin}
                  onChange={(value) =>
                    updateEmail(index, "daysBeforeCheckin", parseInt(value, 10) || 0)
                  }
                  helper="0 = morning of stay"
                />
                <Field
                  label="SendGrid template ID"
                  value={email.templateId || ""}
                  onChange={(value) => updateEmail(index, "templateId", value)}
                  placeholder="d-xxxxxxxx"
                  mono
                />
              </div>
              <div className="mt-3">
                <Field
                  label="Label"
                  value={email.label || ""}
                  onChange={(value) => updateEmail(index, "label", value)}
                  placeholder="2 days before"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addEmail}
            className="rounded-full border border-sand bg-white px-4 py-2 text-sm font-medium text-forest transition hover:border-grove hover:text-grove"
          >
            Add reminder
          </button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Access code release"
        description="On check-in day, sends the code template after the release time if the form is complete. Otherwise sends the missing-form template."
        badge={codeRelease.enabled ? "Enabled" : "Disabled"}
        open={accessOpen}
        onToggle={() => setAccessOpen((value) => !value)}
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-xl border border-sand/80 bg-cream/30 p-4">
            <div>
              <h4 className="text-sm font-semibold text-forest">Code release automation</h4>
              <p className="mt-1 text-xs text-forest/50">
                The daily cron checks this release time in Central time.
              </p>
            </div>
            <Toggle
              enabled={Boolean(codeRelease.enabled)}
              onChange={(enabled) => updateCodeRelease("enabled", enabled)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Release hour Central"
              type="number"
              value={codeRelease.releaseHourCentral ?? 11}
              onChange={(value) =>
                updateCodeRelease(
                  "releaseHourCentral",
                  Math.max(0, Math.min(23, Number(value || 0)))
                )
              }
              helper="24-hour time. 15 means 3 PM."
            />
            <Field
              label="Release minute"
              type="number"
              value={codeRelease.releaseMinuteCentral ?? 0}
              onChange={(value) =>
                updateCodeRelease(
                  "releaseMinuteCentral",
                  Math.max(0, Math.min(59, Number(value || 0)))
                )
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="Template 1: code email"
              value={codeRelease.sendgridTemplateId || ""}
              onChange={(value) => updateCodeRelease("sendgridTemplateId", value)}
              placeholder="d-xxxxxxxx"
              mono
              helper="Sent after the selected form is complete."
            />
            <Field
              label="Template 2: missing form email"
              value={codeRelease.missingFormTemplateId || ""}
              onChange={(value) => updateCodeRelease("missingFormTemplateId", value)}
              placeholder="d-xxxxxxxx"
              mono
              helper="Sent when the selected form is still missing."
            />
          </div>

          <div className="rounded-xl border border-sand/80">
            <button
              type="button"
              onClick={() => setVariablesOpen((value) => !value)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <h4 className="text-sm font-semibold text-forest">
                  SendGrid variables
                </h4>
                <p className="mt-0.5 text-xs text-forest/50">
                  Template keys available to both access-code templates.
                </p>
              </div>
              <Chevron open={variablesOpen} />
            </button>
            {variablesOpen ? (
              <div className="grid grid-cols-2 gap-2 border-t border-sand/70 p-4 text-xs sm:grid-cols-3">
                {TEMPLATE_VARIABLES.map((variable) => (
                  <span
                    key={variable}
                    className="rounded border border-sand bg-white px-2 py-1 font-mono text-forest/80"
                  >
                    {`{{${variable}}}`}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-sand/80 bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-forest">
                  Property message settings
                </h4>
                <p className="mt-1 text-xs text-forest/50">
                  Choose one property and edit only the values that appear in
                  guest messages and the guest portal.
                </p>
              </div>
              <span className="text-xs text-forest/40">{propertyStatusLabel}</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(220px,320px)_1fr]">
              <label className="block text-xs uppercase tracking-wider text-forest/60">
                Property
                <select
                  value={selectedKey}
                  onChange={(event) => setSelectedPropertyKey(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                >
                  {propertyRows.map((property) => (
                    <option key={property.key} value={property.key}>
                      {property.name}
                    </option>
                  ))}
                </select>
                {selectedProperty?.id ? (
                  <span className="mt-1 block text-xs normal-case tracking-normal text-forest/40">
                    Lodgify ID {selectedProperty.id}
                  </span>
                ) : null}
              </label>

              <div className="rounded-xl bg-cream/40 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {SIMPLE_PROPERTY_FIELDS.map((field) => (
                    <Field
                      key={field.key}
                      label={field.label}
                      value={selectedMessageData[field.key] || ""}
                      onChange={(value) =>
                        updatePropertyMessageField(selectedConfigKey, field.key, value)
                      }
                      placeholder={field.placeholder}
                    />
                  ))}

                  <label className="block text-xs uppercase tracking-wider text-forest/60">
                    Access code
                    <select
                      value={selectedCodeSource}
                      onChange={(event) =>
                        updateCodeSource(selectedConfigKey, event.target.value)
                      }
                      className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                    >
                      <option value="jervis">Generated dynamically</option>
                      <option value="static">Fixed code</option>
                    </select>
                  </label>

                  {selectedCodeSource === "static" ? (
                    <Field
                      label="Fixed access code"
                      value={selectedStaticCode}
                      onChange={(value) => setPropertyCode(selectedCodeKey, value)}
                      placeholder="1968"
                      mono
                    />
                  ) : null}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  {LONG_PROPERTY_FIELDS.map((field) => (
                    <TextAreaField
                      key={field.key}
                      label={field.label}
                      value={selectedMessageData[field.key] || ""}
                      onChange={(value) =>
                        updatePropertyMessageField(selectedConfigKey, field.key, value)
                      }
                      placeholder={field.placeholder}
                      rows={field.rows}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
