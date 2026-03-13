"use client";

import Toggle from "./Toggle";

export default function VacancyPanel({ config, onChange }) {
  function updateEnabled(enabled) {
    onChange({ ...config, enabled });
  }

  function updateWindow(index, field, value) {
    const windows = [...config.windows];
    windows[index] = { ...windows[index], [field]: value };
    onChange({ ...config, windows });
  }

  function addWindow() {
    const windows = [
      ...config.windows,
      { daysBeforeCheckin: 7, templateId: "" },
    ];
    onChange({ ...config, windows });
  }

  function removeWindow(index) {
    const windows = config.windows.filter((_, i) => i !== index);
    onChange({ ...config, windows });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl text-forest">
          Vacancy Promo Emails
        </h2>
        <Toggle enabled={config.enabled} onChange={updateEnabled} />
      </div>

      <p className="text-sm text-forest/70">
        Contact list is configured in{" "}
        <span className="font-medium">Settings</span> and shared across automations.
      </p>

      <div className="space-y-4">
        {config.windows.map((w, idx) => (
          <div
            key={idx}
            className="bg-white rounded-xl shadow-sm border border-sand p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-forest">
                Window {idx + 1}
              </span>
              <button
                onClick={() => removeWindow(idx)}
                className="text-red-400 hover:text-red-600 transition-colors text-sm"
                title="Remove this window"
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                  Days Before Check-in
                </label>
                <input
                  type="number"
                  min={1}
                  value={w.daysBeforeCheckin}
                  onChange={(e) =>
                    updateWindow(
                      idx,
                      "daysBeforeCheckin",
                      parseInt(e.target.value) || 1
                    )
                  }
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </div>
              <div>
                <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
                  SendGrid Template ID
                </label>
                <input
                  type="text"
                  value={w.templateId}
                  onChange={(e) =>
                    updateWindow(idx, "templateId", e.target.value)
                  }
                  placeholder="d-xxxxxxxx"
                  className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addWindow}
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
        Add New Window
      </button>
    </div>
  );
}
