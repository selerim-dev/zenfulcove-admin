"use client";

import SendGridListPicker from "./SendGridListPicker";
import PropertyVariablesSettings from "./PropertyVariablesSettings";

export default function SettingsPanel({
  config,
  onChange,
  messageNotifications,
  onMessageNotificationsChange,
  customerPortal,
  onCustomerPortalChange,
  accessCodeRelease,
  onAccessCodeReleaseChange,
}) {
  const sg = config || {};
  const notif = messageNotifications || {};
  const portal = customerPortal || {};
  const portalNav = portal.navigation || {};

  function update(field, value) {
    onChange({ ...sg, [field]: value });
  }

  function updateNotif(field, value) {
    onMessageNotificationsChange({ ...notif, [field]: value });
  }

  function updatePortalNav(field, value) {
    onCustomerPortalChange({
      ...portal,
      navigation: {
        ...portalNav,
        [field]: value,
      },
    });
  }

  const recipientsText = Array.isArray(notif.recipients)
    ? notif.recipients.join(", ")
    : "";

  function handleRecipientsChange(raw) {
    const list = String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    updateNotif("recipients", list);
  }

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-2xl text-forest">Shared Settings</h2>
      <p className="text-sm text-forest/70">
        Used by all automations. Edit once, applies everywhere.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-4">
        <div>
          <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
            From Email
          </label>
          <input
            type="email"
            value={sg.fromEmail || ""}
            onChange={(e) => update("fromEmail", e.target.value)}
            placeholder="contact@zenfulcove.com"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
        </div>
        <div>
          <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
            From Name
          </label>
          <input
            type="text"
            value={sg.fromName || ""}
            onChange={(e) => update("fromName", e.target.value)}
            placeholder="Zenfulcove Glamping"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
        </div>
        <SendGridListPicker
          label="SendGrid Contact List"
          value={sg.sendgridContactListId || ""}
          onChange={(value) => update("sendgridContactListId", value)}
          helperText="Shared contact list used by vacancy promo emails and other automations."
        />
      </div>

      <PropertyVariablesSettings
        config={accessCodeRelease || {}}
        onChange={onAccessCodeReleaseChange}
      />

      <h2 className="font-serif text-2xl text-forest pt-4">
        Guest Portal Navigation
      </h2>
      <p className="text-sm text-forest/70">
        Choose which links guests see in the portal sidebar.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-3">
        {[
          ["rentals", "My Stay"],
          ["availability", "Kayak Availability"],
          ["forms", "Published Forms"],
          ["terms", "Terms"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-4 rounded-lg border border-sand px-4 py-3">
            <span className="text-sm font-medium text-forest">{label}</span>
            <input
              type="checkbox"
              checked={portalNav[key] !== false}
              onChange={(e) => updatePortalNav(key, e.target.checked)}
              className="h-4 w-4 accent-grove"
            />
          </label>
        ))}
      </div>

      <h2 className="font-serif text-2xl text-forest pt-4">
        Inbound SMS Notifications
      </h2>
      <p className="text-sm text-forest/70">
        Email alerts whenever a Twilio number receives an SMS. Recipients are
        internal admins — customers are never contacted.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={!!notif.enabled}
            onChange={(e) => updateNotif("enabled", e.target.checked)}
            className="h-4 w-4 accent-grove"
          />
          <span className="text-sm text-forest">Enabled</span>
        </label>

        <div>
          <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
            Recipients
          </label>
          <input
            type="text"
            value={recipientsText}
            onChange={(e) => handleRecipientsChange(e.target.value)}
            placeholder="contact@zenfulcove.com, owner@zenfulcove.com"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <p className="text-xs text-forest/50 mt-1">
            Comma-separated list of internal email addresses.
          </p>
        </div>

        <div>
          <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
            Subject Prefix
          </label>
          <input
            type="text"
            value={notif.subjectPrefix || ""}
            onChange={(e) => updateNotif("subjectPrefix", e.target.value)}
            placeholder="[Zenfulcove Glamping SMS]"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
        </div>

        <div>
          <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
            Dashboard URL (for deep links)
          </label>
          <input
            type="url"
            value={notif.dashboardUrl || ""}
            onChange={(e) => updateNotif("dashboardUrl", e.target.value)}
            placeholder="https://zenfulcove-admin.vercel.app/"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <p className="text-xs text-forest/50 mt-1">
            Base URL used to build deep links in the alert emails. Leave blank
            to use the default production URL
            (https://zenfulcove-admin.vercel.app/).
          </p>
        </div>
      </div>
    </div>
  );
}
