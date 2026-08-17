"use client";

import SendGridListPicker from "./SendGridListPicker";
import PropertyVariablesSettings from "./PropertyVariablesSettings";
import ReservationFormTermsSettings from "./ReservationFormTermsSettings";

const MY_STAY_CONTENT_SECTIONS = [
  {
    key: "thingsToDoInElgin",
    label: "Things To Do In Elgin",
    description: "Guest-facing local guide card on the My Stay page.",
  },
  {
    key: "elginSpotlight",
    label: "Elgin Spotlight",
    description: "Guest-facing around-town card on the My Stay page.",
  },
];

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
  const myStaySections = portal.myStaySections || {};

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

  function updateMyStaySection(sectionKey, field, value) {
    onCustomerPortalChange({
      ...portal,
      myStaySections: {
        ...myStaySections,
        [sectionKey]: {
          ...(myStaySections[sectionKey] || {}),
          [field]: value,
        },
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
        <div>
          <label className="block text-xs text-forest/60 uppercase tracking-wider mb-1">
            Marketing Unsubscribe Group ID
          </label>
          <input
            type="number"
            min={1}
            value={sg.marketingUnsubscribeGroupId || ""}
            onChange={(e) => update("marketingUnsubscribeGroupId", e.target.value)}
            placeholder="SendGrid ASM group ID"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <p className="mt-1 text-xs text-forest/50">
            Applied only to promotional sends for group suppression and one-click unsubscribe. Add the matching unsubscribe module to each marketing template.
          </p>
        </div>
      </div>

      <PropertyVariablesSettings
        config={accessCodeRelease || {}}
        onChange={onAccessCodeReleaseChange}
      />

      <ReservationFormTermsSettings accessCodeRelease={accessCodeRelease || {}} />

      <h2 className="font-serif text-2xl text-forest pt-4">
        Guest Portal Navigation
      </h2>
      <p className="text-sm text-forest/70">
        Choose which links guests see in the portal sidebar.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-3">
        {[
          ["rentals", "My Stay"],
          ["messages", "Messages"],
          ["availability", "Kayak Availability"],
          ["packages", "Special Packages and More"],
          ["spa", "In-Cabin Massage"],
          ["timing", "Late Check Out/Early Check In"],
          ["forms", "Published Forms"],
          ["terms", "Terms"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-4 rounded-lg border border-sand px-4 py-3">
            <span className="text-sm font-medium text-forest">{label}</span>
            <input
              type="checkbox"
              checked={key === "messages" || key === "spa" ? portalNav[key] === true : portalNav[key] !== false}
              onChange={(e) => updatePortalNav(key, e.target.checked)}
              className="h-4 w-4 accent-grove"
            />
          </label>
        ))}
      </div>

      <h2 className="font-serif text-2xl text-forest pt-4">
        My Stay Content
      </h2>
      <p className="text-sm text-forest/70">
        Edit the guest-facing content cards that appear on the My Stay page.
      </p>

      <div className="grid gap-4">
        {MY_STAY_CONTENT_SECTIONS.map((section) => {
          const value = myStaySections[section.key] || {};
          return (
            <div
              key={section.key}
              className="bg-white rounded-xl shadow-sm border border-sand p-5 space-y-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-serif text-xl text-forest">
                    {section.label}
                  </h3>
                  <p className="mt-1 text-sm text-forest/60">
                    {section.description}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-forest">
                  <input
                    type="checkbox"
                    checked={value.enabled !== false}
                    onChange={(e) =>
                      updateMyStaySection(
                        section.key,
                        "enabled",
                        e.target.checked
                      )
                    }
                    className="h-4 w-4 accent-grove"
                  />
                  Enabled
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-xs text-forest/60 uppercase tracking-wider">
                  Eyebrow
                  <input
                    type="text"
                    value={value.eyebrow || ""}
                    onChange={(e) =>
                      updateMyStaySection(section.key, "eyebrow", e.target.value)
                    }
                    placeholder="Local Guide"
                    className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                  />
                </label>
                <label className="block text-xs text-forest/60 uppercase tracking-wider">
                  Title
                  <input
                    type="text"
                    value={value.title || ""}
                    onChange={(e) =>
                      updateMyStaySection(section.key, "title", e.target.value)
                    }
                    placeholder={section.label}
                    className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                  />
                </label>
                <label className="block text-xs text-forest/60 uppercase tracking-wider">
                  Link Label
                  <input
                    type="text"
                    value={value.linkLabel || ""}
                    onChange={(e) =>
                      updateMyStaySection(
                        section.key,
                        "linkLabel",
                        e.target.value
                      )
                    }
                    placeholder="Explore"
                    className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                  />
                </label>
                <label className="block text-xs text-forest/60 uppercase tracking-wider">
                  Link URL
                  <input
                    type="url"
                    value={value.linkUrl || ""}
                    onChange={(e) =>
                      updateMyStaySection(section.key, "linkUrl", e.target.value)
                    }
                    placeholder="https://www.elgintexas.gov/"
                    className="mt-1 block w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                  />
                </label>
              </div>

              <label className="block text-xs text-forest/60 uppercase tracking-wider">
                Body
                <textarea
                  value={value.body || ""}
                  onChange={(e) =>
                    updateMyStaySection(section.key, "body", e.target.value)
                  }
                  rows={3}
                  placeholder="Guest-facing description..."
                  className="mt-1 block w-full resize-y rounded-lg border border-sand bg-white px-3 py-2 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-grove/30"
                />
              </label>
            </div>
          );
        })}
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
            placeholder="https://stay.zenfulcove.com/"
            className="border border-sand rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-grove/30"
          />
          <p className="text-xs text-forest/50 mt-1">
            Base URL used to build deep links in the alert emails. Leave blank
            to use the default production URL
            (https://stay.zenfulcove.com/).
          </p>
        </div>
      </div>
    </div>
  );
}
