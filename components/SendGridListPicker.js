"use client";

import { useEffect, useState } from "react";

export default function SendGridListPicker({
  value,
  onChange,
  label = "SendGrid Contact List",
  helperText,
  placeholder = "Select a SendGrid list…",
  className = "",
}) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentValue = String(value || "").trim();

  async function loadLists() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sendgrid-lists");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load SendGrid lists");
      const sorted = [...(data.lists || [])].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );
      setLists(sorted);
    } catch (err) {
      setError(err.message || "Failed to load SendGrid lists");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLists();
  }, []);

  const selected = lists.find((list) => list.id === currentValue);

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs text-forest/60 uppercase tracking-wider">
          {label}
        </label>
        <button
          type="button"
          onClick={loadLists}
          disabled={loading}
          className="text-xs font-medium text-forest/50 hover:text-forest disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      <select
        value={currentValue}
        onChange={(e) => {
          const id = e.target.value;
          const matched = lists.find((list) => list.id === id);
          onChange(id, matched);
        }}
        disabled={loading || lists.length === 0}
        className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30 disabled:opacity-50"
      >
        {!currentValue ? (
          <option value="">{placeholder}</option>
        ) : null}
        {currentValue && !selected ? (
          <option value={currentValue}>{`(unknown list — ${currentValue})`}</option>
        ) : null}
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name} — {Number(list.contactCount || 0).toLocaleString()} contacts
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-xs text-red-600 mt-1">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-forest/40 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
}
