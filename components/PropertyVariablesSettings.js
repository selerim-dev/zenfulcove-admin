"use client";

import { useEffect, useMemo, useState } from "react";

const KNOWN_UNITS = [
  { id: "608952", name: "Fairy House" },
  { id: "608953", name: "Desert Rose" },
  { id: "608954", name: "Sky Castle" },
  { id: "608955", name: "Bird House" },
  { id: "754651", name: "Doodle House" },
];

const PROPERTY_VARIABLE_FIELDS = [
  {
    key: "displayName",
    label: "Display name",
    placeholder: "SKY CASTLE",
    helper: "Used by {{propertyDisplayName}} in messages and the My Stay page.",
  },
  {
    key: "directionsName",
    label: "Directions/sign name",
    placeholder: "SKY CASTLE",
    helper: "Used in fallback directions.",
  },
  {
    key: "address",
    label: "Address shown",
    placeholder: "103 potato smith rd, unit c, elgin texas 78621",
  },
  {
    key: "googleMapsAddress",
    label: "Google Maps label",
    placeholder: "103 potato smith rd, unit c, elgin texas 78621",
  },
  {
    key: "googleMapsUrl",
    label: "Google Maps URL",
    placeholder: "https://maps.app.goo.gl/QowaHLFH3anBavuv6?g_st=ic",
  },
  {
    key: "wifiName",
    label: "Wi-Fi network",
    placeholder: "SKYCASTLE",
  },
  {
    key: "wifiPassword",
    label: "Wi-Fi password",
    placeholder: "Iamgrateful!",
  },
  {
    key: "unitDirections",
    label: "Unit directions",
    placeholder: "Once you are at Zenfulcove Glamping, follow the signs...",
    multiline: true,
  },
  {
    key: "parkingInstructions",
    label: "Parking instructions",
    placeholder: "Parking - please park in front of your unit...",
    multiline: true,
  },
  {
    key: "dedicatedKayakText",
    label: "Dedicated kayak text",
    placeholder: "There is one dedicated kayak for this unit...",
    multiline: true,
  },
  {
    key: "additionalKayakText",
    label: "Additional kayak text",
    placeholder: "Additional kayaks are available for rent...",
    multiline: true,
  },
  {
    key: "lifeJacketText",
    label: "Life jacket text",
    placeholder: "Please use the provided life jackets...",
    multiline: true,
  },
  {
    key: "amenitiesText",
    label: "Amenities text",
    placeholder: "There is a gas grill on the deck...",
    multiline: true,
  },
  {
    key: "additionalRulesText",
    label: "Additional rules text",
    placeholder: "Additional rules are in the unit...",
    multiline: true,
  },
  {
    key: "hostName",
    label: "Host name",
    placeholder: "Norma",
  },
  {
    key: "urgentPhone",
    label: "Urgent phone",
    placeholder: "512-273-7962",
  },
];

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

function TextField({ field, value, onChange }) {
  const inputClass =
    "mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30";

  return (
    <label className="block text-xs text-forest/60">
      <span className="uppercase tracking-wider">{field.label}</span>
      {field.multiline ? (
        <textarea
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={`${inputClass} resize-y`}
        />
      ) : (
        <input
          type="text"
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className={inputClass}
        />
      )}
      {field.helper ? (
        <span className="mt-1 block text-xs leading-relaxed text-forest/40">
          {field.helper}
        </span>
      ) : null}
    </label>
  );
}

export default function PropertyVariablesSettings({ config = {}, onChange }) {
  const [lodgifyProperties, setLodgifyProperties] = useState([]);
  const [status, setStatus] = useState("loading");
  const [selectedPropertyKey, setSelectedPropertyKey] = useState("");
  const propertyMessageData = useMemo(
    () => config.propertyMessageData || {},
    [config.propertyMessageData]
  );

  useEffect(() => {
    let active = true;
    fetch("/api/lodgify/properties")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) throw new Error(data.error || "Failed to load Lodgify properties.");
        setLodgifyProperties(Array.isArray(data.properties) ? data.properties : []);
        setStatus("loaded");
      })
      .catch(() => {
        if (!active) return;
        setStatus("failed");
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
    Object.keys(propertyMessageData || {}).forEach((key) => addRow({ name: key }));

    return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [lodgifyProperties, propertyMessageData]);

  const selectedProperty =
    propertyRows.find((property) => property.key === selectedPropertyKey) ||
    propertyRows[0];
  const selectedEntry = findMapEntry(propertyMessageData, selectedProperty);
  const selectedConfigKey = selectedEntry?.key || selectedProperty?.key || "";
  const selectedData =
    selectedEntry?.value && typeof selectedEntry.value === "object"
      ? selectedEntry.value
      : {};

  function updateField(field, value) {
    if (!selectedConfigKey) return;
    const nextMap = { ...(propertyMessageData || {}) };
    const current =
      nextMap[selectedConfigKey] && typeof nextMap[selectedConfigKey] === "object"
        ? { ...nextMap[selectedConfigKey] }
        : {};
    const nextValue = String(value || "");
    if (nextValue.trim()) {
      current[field] = nextValue;
    } else {
      delete current[field];
    }
    if (Object.keys(current).length) {
      nextMap[selectedConfigKey] = current;
    } else {
      delete nextMap[selectedConfigKey];
    }
    onChange?.({ ...config, propertyMessageData: nextMap });
  }

  const statusLabel =
    status === "loaded"
      ? `${lodgifyProperties.length} Lodgify loaded`
      : status === "loading"
        ? "Loading Lodgify"
        : "Fallback property list";

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl text-forest">Property Variables</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-forest/70">
            Per-property stay details used by Lodgify messages and the customer
            My Stay page.
          </p>
        </div>
        <span className="rounded-full border border-sand bg-white px-3 py-1 text-xs text-forest/60">
          {statusLabel}
        </span>
      </div>

      <div className="grid gap-4 rounded-xl border border-sand bg-white p-5 shadow-sm lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-2">
          <label className="block text-xs uppercase tracking-wider text-forest/60">
            Property
            <select
              value={selectedProperty?.key || ""}
              onChange={(event) => setSelectedPropertyKey(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
            >
              {propertyRows.map((property) => (
                <option key={property.key} value={property.key}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>

          <div className="hidden gap-1 lg:flex lg:flex-col">
            {propertyRows.map((property) => {
              const active = property.key === selectedProperty?.key;
              return (
                <button
                  key={property.key}
                  type="button"
                  onClick={() => setSelectedPropertyKey(property.key)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    active
                      ? "border-grove bg-grove/10 text-forest"
                      : "border-transparent text-forest/60 hover:border-sand hover:bg-cream/50"
                  }`}
                >
                  <span className="block font-medium">{property.name}</span>
                  {property.id ? (
                    <span className="mt-0.5 block text-xs text-forest/40">
                      Lodgify ID {property.id}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="rounded-lg border border-sand bg-cream/30 px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-forest/50">
              Editing
            </p>
            <p className="mt-1 font-serif text-2xl text-forest">
              {selectedProperty?.name || "Property"}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {PROPERTY_VARIABLE_FIELDS.map((field) => (
              <TextField
                key={field.key}
                field={field}
                value={selectedData[field.key] || ""}
                onChange={(value) => updateField(field.key, value)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
