"use client";

import Toggle from "./Toggle";

function SyncCard({ title, description, enabled, onToggle, children }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-serif text-xl text-forest">{title}</h3>
          <p className="text-sm text-forest/70 mt-1">{description}</p>
        </div>
        <Toggle enabled={enabled} onChange={onToggle} />
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children }) {
  return (
    <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
      {children}
    </label>
  );
}

export default function SyncsPanel({ jotformConfig, lodgifyConfig, onChange }) {
  const safeJotformConfig = jotformConfig || {};
  const safeLodgifyConfig = lodgifyConfig || {};

  function updateJotform(field, value) {
    onChange({
      jotformClientSync: { ...safeJotformConfig, [field]: value },
      lodgifyClientSync: safeLodgifyConfig,
    });
  }

  function updateLodgify(field, value) {
    onChange({
      jotformClientSync: safeJotformConfig,
      lodgifyClientSync: { ...safeLodgifyConfig, [field]: value },
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-serif text-2xl text-forest">Syncs</h2>
        <p className="text-sm text-forest/70">
          Sync guest contact data from external systems into SendGrid so follow-up
          automations can use the most complete email and phone records available.
          Activity Log below shows both syncs together with the rest of the system.
        </p>
      </div>

      <SyncCard
        title="Jotform Client Sync"
        description="Pull contacts from Jotform submissions and upsert them into your master SendGrid client list."
        enabled={safeJotformConfig.enabled}
        onToggle={(enabled) => updateJotform("enabled", enabled)}
      >
        <div>
          <FieldLabel>SendGrid Master List ID</FieldLabel>
          <input
            type="text"
            value={safeJotformConfig.sendgridContactListId || ""}
            onChange={(e) => updateJotform("sendgridContactListId", e.target.value)}
            placeholder="e.g. e46aa43e-3f91-4965-8bbb-fcae8f9c3124"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
        </div>

        <div>
          <FieldLabel>Jotform Form IDs</FieldLabel>
          <textarea
            value={(safeJotformConfig.jotformFormIds || []).join(", ")}
            onChange={(e) => {
              const ids = e.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
              updateJotform("jotformFormIds", ids);
            }}
            placeholder="e.g. 251834442091050"
            rows={3}
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <p className="text-xs text-forest/40 mt-1">
            Comma-separated form IDs. All submissions from each listed form are read on every sync run.
          </p>
        </div>
      </SyncCard>

      <SyncCard
        title="Lodgify Client Sync"
        description="Pull guest contacts from Lodgify bookings and upsert them into SendGrid, including bookings that later cancel when Lodgify still exposes the guest record."
        enabled={safeLodgifyConfig.enabled}
        onToggle={(enabled) => updateLodgify("enabled", enabled)}
      >
        <div>
          <FieldLabel>SendGrid Master List ID</FieldLabel>
          <input
            type="text"
            value={safeLodgifyConfig.sendgridContactListId || ""}
            onChange={(e) => updateLodgify("sendgridContactListId", e.target.value)}
            placeholder="e.g. e46aa43e-3f91-4965-8bbb-fcae8f9c3124"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full font-mono focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <p className="text-xs text-forest/40 mt-1">
            Usually this should be the same master client list used by the Jotform sync.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>Stay-Date Lookback (Days)</FieldLabel>
            <input
              type="number"
              min="0"
              value={safeLodgifyConfig.stayDateLookbackDays ?? 30}
              onChange={(e) =>
                updateLodgify("stayDateLookbackDays", Number(e.target.value || 0))
              }
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
          <div>
            <FieldLabel>Stay-Date Lookahead (Days)</FieldLabel>
            <input
              type="number"
              min="0"
              value={safeLodgifyConfig.stayDateLookaheadDays ?? 365}
              onChange={(e) =>
                updateLodgify("stayDateLookaheadDays", Number(e.target.value || 0))
              }
              className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-sand px-4 py-3">
          <div>
            <p className="text-sm font-medium text-forest">Include Cancelled Bookings</p>
            <p className="text-xs text-forest/50 mt-1">
              Keeps canceled bookings eligible for lead capture when Lodgify still returns their guest contact data.
            </p>
          </div>
          <Toggle
            enabled={safeLodgifyConfig.includeCancelledBookings !== false}
            onChange={(enabled) => updateLodgify("includeCancelledBookings", enabled)}
          />
        </div>
      </SyncCard>
    </div>
  );
}
