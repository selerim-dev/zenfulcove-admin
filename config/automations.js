// ─── Default Automation Config ──────────────────────────────────────────────
// This file is the SEED for Upstash KV on first run.
// After that, all values are read/written from KV via the dashboard.
// To change defaults for a fresh deploy, edit here.
//
// ALL configurable IDs and values live in this single file.
// ────────────────────────────────────────────────────────────────────────────

export const automationConfig = {
  sendgrid: {
    fromEmail: "contact@zenfulcove.com",
    fromName: "Zenfulcove",
    sendgridContactListId: "65075b7e-7fd3-4357-9953-6ff3ce2ff59b", // "Lodgify Booked Guests" — shared by all automations
  },
  vacancyEmails: {
    enabled: true,
    windows: [
      {
        daysBeforeCheckin: 7,
        templateId: "d-REPLACE_ME_7DAY", // SendGrid dynamic template for 7-day promo
      },
      {
        daysBeforeCheckin: 4,
        templateId: "d-REPLACE_ME_4DAY", // SendGrid dynamic template for 4-day promo
      },
    ],
  },
  waiverReminders: {
    enabled: true,
    propertyIds: [], // Lodgify property IDs to restrict to (e.g. Zenfulcove only). Empty = all properties.
    jotformFormId: "251834442091050", // JotForm waiver form ID (same form for all emails)
    emails: [
      // Only 2, 1, and 0 days before check-in are sent; any other days in dashboard config are ignored by cron
      { daysBeforeCheckin: 2, templateId: "d-REPLACE_ME_JOTFORM_2DAY", label: "Reminder (2 days before)" },
      { daysBeforeCheckin: 1, templateId: "d-REPLACE_ME_JOTFORM_1DAY", label: "Reminder (1 day before)" },
      { daysBeforeCheckin: 0, templateId: "d-REPLACE_ME_JOTFORM_0DAY", label: "Reminder (morning of)" },
    ],
  },
  popupFollowups: {
    enabled: false,
    channelMode: "email",
    sendgridContactListId: "44b5b3f5-d03d-4552-997f-8715a906d5b8",
    popupTriggeredFieldId: "popup_triggered_at",
    popupSentTemplatesFieldId: "popup_sent_templates",
    popupSentSmsFieldId: "popup_sent_sms",
    testDestinations: {
      email: "",
      sms: "",
    },
    emails: [
      { daysAfterTrigger: 2, templateId: "", label: "Follow-up (2 days after)" },
      { daysAfterTrigger: 3, templateId: "", label: "Follow-up (3 days after)" },
      { daysAfterTrigger: 6, templateId: "", label: "Follow-up (6 days after)" },
    ],
    sms: [
      { daysAfterTrigger: 2, messageKey: "sms_day_2", label: "SMS (2 days after)", messageBody: "", enabled: true },
      { daysAfterTrigger: 3, messageKey: "sms_day_3", label: "SMS (3 days after)", messageBody: "", enabled: true },
      { daysAfterTrigger: 6, messageKey: "sms_day_6", label: "SMS (6 days after)", messageBody: "", enabled: true },
    ],
  },
  eventPopupSalesmateSms: {
    enabled: false,
    syncToSalesmate: true,
    sendgridContactListId: "dc7aeb0a-c70c-4c6e-a1cd-b0c8c2b93cb8",
    triggerDateFieldId: "",
    twilioFromNumber: "",
    salesmateLeadSource: "Website",
    salesmateTags: ["admin portal", "event popup"],
    testDestinations: {
      sms: "",
    },
    sms: [
      {
        id: "event_popup_sms_day_0",
        daysAfterTrigger: 0,
        messageBody: "",
        enabled: true,
      },
    ],
  },
  jotformClientSync: {
    enabled: false,
    sendgridContactListId: "e46aa43e-3f91-4965-8bbb-fcae8f9c3124",
    jotformFormIds: ["251834442091050"],
  },
  localFormClientSync: {
    enabled: false,
    sendgridContactListId: "e46aa43e-3f91-4965-8bbb-fcae8f9c3124",
    formSlugs: ["guest-info"],
    onlyUnsynced: false,
  },
  lodgifyClientSync: {
    enabled: false,
    sendgridContactListId: "e46aa43e-3f91-4965-8bbb-fcae8f9c3124",
    stayDateLookbackDays: 30,
    stayDateLookaheadDays: 365,
    includeCancelledBookings: true,
  },
  // Always-on daily sweep that mirrors a SINGLE master SendGrid list into
  // Salesmate. For each contact in `sourceListId`, tags are derived from every
  // *other* SendGrid list the contact also belongs to (using SendGrid's
  // `list_ids` field on each contact), so a single Salesmate write per contact
  // captures every form they came from. Re-syncs only when the derived tag set
  // changes for that contact.
  salesmateFormSync: {
    enabled: true,
    leadSource: "Website",
    // The master list (default = "All Clients"). Every contact in this list is
    // mirrored into Salesmate.
    sourceListId: "e46aa43e-3f91-4965-8bbb-fcae8f9c3124",
  },
  // Real-time email alert when an inbound SMS is received at any Twilio
  // number. Fires from the Twilio inbound webhook, so latency is whatever
  // SendGrid takes (typically <1s). Recipients can be one or many.
  messageNotifications: {
    enabled: true,
    recipients: ["contact@zenfulcove.com"],
    subjectPrefix: "[Zenfulcove SMS]",
    // Base URL of the admin dashboard. Used to deep-link the alert email
    // straight to the messages tab + thread. Falls back to
    // NEXT_PUBLIC_DASHBOARD_URL env var if blank.
    dashboardUrl: "",
  },
  customerPortal: {
    navigation: {
      rentals: true,
      availability: true,
      forms: true,
      terms: true,
    },
  },
};
