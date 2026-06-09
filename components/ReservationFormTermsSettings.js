"use client";

import { useEffect, useMemo, useState } from "react";

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .replace(/^\/?forms\//, "") || "welcome-to-zenfulcove";
}

export default function ReservationFormTermsSettings({ accessCodeRelease = {} }) {
  const formSlug = useMemo(
    () => normalizeSlug(accessCodeRelease.localFormSlug),
    [accessCodeRelease.localFormSlug]
  );
  const [loadedSlug, setLoadedSlug] = useState("");
  const [formName, setFormName] = useState("");
  const [termsText, setTermsText] = useState("");
  const [savedTermsText, setSavedTermsText] = useState("");
  const [status, setStatus] = useState("loading");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const dirty = termsText !== savedTermsText;

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setMessage("");

    fetch(`/api/forms/settings?slug=${encodeURIComponent(formSlug)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) throw new Error(data.error || "Failed to load form terms.");
        const form = data.form || {};
        const nextTerms = String(form.termsText || "");
        setLoadedSlug(form.slug || formSlug);
        setFormName(form.name || formSlug);
        setTermsText(nextTerms);
        setSavedTermsText(nextTerms);
        if (data.configured === false) {
          setStatus("failed");
          setMessage(data.error || "Local form database is not configured.");
          return;
        }
        setStatus("loaded");
      })
      .catch((err) => {
        if (!active) return;
        setStatus("failed");
        setMessage(err instanceof Error ? err.message : "Failed to load form terms.");
      });

    return () => {
      active = false;
    };
  }, [formSlug]);

  async function saveTerms() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/forms/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: loadedSlug || formSlug,
          termsText,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to save terms.");
      const saved = String(data.form?.termsText || termsText || "");
      setTermsText(saved);
      setSavedTermsText(saved);
      setLoadedSlug(data.form?.slug || loadedSlug || formSlug);
      setFormName(data.form?.name || formName || formSlug);
      setStatus("loaded");
      setMessage("Terms saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save terms.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl text-forest">
            Reservation Form Terms
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-forest/70">
            Edit the terms shown inside the internal reservation form.
          </p>
        </div>
        <span className="rounded-full border border-sand bg-white px-3 py-1 text-xs text-forest/60">
          {status === "loading"
            ? "Loading form"
            : status === "failed"
              ? "Needs attention"
              : formName || loadedSlug || formSlug}
        </span>
      </div>

      <div className="rounded-xl border border-sand bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-forest/50">
              Form
            </p>
            <p className="mt-1 font-serif text-xl text-forest">
              {formName || loadedSlug || formSlug}
            </p>
            <p className="mt-1 text-xs text-forest/50">
              /forms/{loadedSlug || formSlug}
            </p>
          </div>
          <button
            type="button"
            onClick={saveTerms}
            disabled={saving || status !== "loaded" || !dirty}
            className="rounded-full bg-grove px-4 py-2 text-sm font-medium text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : dirty ? "Save terms" : "Saved"}
          </button>
        </div>

        <label className="mt-5 block text-xs text-forest/60">
          <span className="uppercase tracking-wider">Terms shown to guests</span>
          <textarea
            value={termsText}
            onChange={(event) => setTermsText(event.target.value)}
            rows={12}
            placeholder="Paste the terms and conditions guests should read and accept."
            className="mt-1 block w-full resize-y rounded-lg border border-sand bg-white px-3 py-2 text-sm leading-relaxed text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
        </label>

        <p className="mt-2 text-xs leading-relaxed text-forest/50">
          This updates the active local form directly. Guests see the new terms
          anywhere the form includes a Terms and Conditions field.
        </p>
        {message ? (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              status === "failed" || /failed|not|error/i.test(message)
                ? "bg-red-50 text-red-700"
                : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
