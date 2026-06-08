"use client";

import { useEffect, useMemo, useState } from "react";
import AdminRouteShell from "@/components/AdminRouteShell";
import EventSettingsPanel from "@/components/EventSettingsPanel";
import type { EventPortalConfig } from "@/components/EventSettingsPanel";
import FloatingSaveBar from "@/components/FloatingSaveBar";

type AppConfig = {
  eventPortal?: EventPortalConfig;
  [key: string]: unknown;
};

export default function AdminEventsPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [savedConfig, setSavedConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/config")
      .then((response) => response.json().then((json) => ({ ok: response.ok, json })))
      .then(({ ok, json }) => {
        if (!active) return;
        if (!ok || json?.error) {
          throw new Error(json?.error || "Could not load event settings.");
        }
        setConfig(json);
        setSavedConfig(json);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load event settings.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!savedRecently) return;
    const timeout = window.setTimeout(() => setSavedRecently(false), 2400);
    return () => window.clearTimeout(timeout);
  }, [savedRecently]);

  const hasUnsavedChanges = useMemo(() => {
    if (!config || !savedConfig) return false;
    return JSON.stringify(config.eventPortal || {}) !== JSON.stringify(savedConfig.eventPortal || {});
  }, [config, savedConfig]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventPortal: config.eventPortal || {} }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || "Failed to save event settings.");
      }
      const updated = json.config || config;
      setConfig(updated);
      setSavedConfig(updated);
      setSavedRecently(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminRouteShell activeCategory="events" activeTitle="Events" contentWidth="wide">
      <header className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
            Customer Portal
          </p>
          <h1 className="mt-2 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
            Events
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Manage whole-property event access, facilitator codes, participant codes, and included properties.
          </p>
        </div>
        <a
          href="/event"
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          Open Event Portal
        </a>
      </header>

      {loading ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-white p-8 text-sm text-[var(--color-ink-muted)]">
          Loading event settings...
        </div>
      ) : error && !config ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
          <p className="font-semibold">Could not load events.</p>
          <p className="mt-2">{error}</p>
        </div>
      ) : config ? (
        <>
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {error}
            </div>
          ) : null}
          <EventSettingsPanel
            config={config.eventPortal || {}}
            onChange={(updated) =>
              setConfig((current) => ({
                ...(current || {}),
                eventPortal: updated,
              }))
            }
          />
        </>
      ) : null}

      <FloatingSaveBar
        visible={hasUnsavedChanges}
        saved={savedRecently}
        saving={saving}
        onSave={handleSave}
        saveLabel="Save events"
        savingLabel="Saving..."
        message="Unsaved event settings"
      />
    </AdminRouteShell>
  );
}
