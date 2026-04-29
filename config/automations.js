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
  lodgifyClientSync: {
    enabled: false,
    sendgridContactListId: "e46aa43e-3f91-4965-8bbb-fcae8f9c3124",
    stayDateLookbackDays: 30,
    stayDateLookaheadDays: 365,
    includeCancelledBookings: true,
  },
};
