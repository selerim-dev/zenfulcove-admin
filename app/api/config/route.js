import { NextResponse } from "next/server";
import { getConfig, setConfig } from "@/lib/kv";

export async function GET() {
  try {
    const config = await getConfig();
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read config", details: err.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const updates = await request.json();
    const current = await getConfig();

    const updated = { ...current };

    if (updates.sendgrid !== undefined) {
      updated.sendgrid = {
        ...updated.sendgrid,
        ...updates.sendgrid,
      };
    }

    if (updates.vacancyEmails !== undefined) {
      updated.vacancyEmails = {
        ...updated.vacancyEmails,
        ...updates.vacancyEmails,
      };
      if (updates.vacancyEmails.windows) {
        updated.vacancyEmails.windows = updates.vacancyEmails.windows;
      }
    }

    if (updates.waiverReminders !== undefined) {
      updated.waiverReminders = {
        ...updated.waiverReminders,
        ...updates.waiverReminders,
      };
      if (updates.waiverReminders.jotformFormId !== undefined) {
        updated.waiverReminders.jotformFormId = updates.waiverReminders.jotformFormId;
      }
      if (updates.waiverReminders.emails) {
        updated.waiverReminders.emails = updates.waiverReminders.emails;
      } else if (updates.waiverReminders.reminders) {
        updated.waiverReminders.reminders = updates.waiverReminders.reminders;
      }
      if (updates.waiverReminders.propertyIds !== undefined) {
        updated.waiverReminders.propertyIds = Array.isArray(updates.waiverReminders.propertyIds)
          ? updates.waiverReminders.propertyIds
          : [];
      }
    }

    if (updates.popupFollowups !== undefined) {
      updated.popupFollowups = {
        ...updated.popupFollowups,
        ...updates.popupFollowups,
      };
      if (updates.popupFollowups.testDestinations !== undefined) {
        updated.popupFollowups.testDestinations = {
          ...updated.popupFollowups.testDestinations,
          ...updates.popupFollowups.testDestinations,
        };
      }
      if (updates.popupFollowups.emails) {
        updated.popupFollowups.emails = updates.popupFollowups.emails;
      }
      if (updates.popupFollowups.sms) {
        updated.popupFollowups.sms = updates.popupFollowups.sms;
      }
      if (updated.popupFollowups.twilio !== undefined) {
        delete updated.popupFollowups.twilio;
      }
    }

    if (updates.eventPopupSalesmateSms !== undefined) {
      updated.eventPopupSalesmateSms = {
        ...updated.eventPopupSalesmateSms,
        ...updates.eventPopupSalesmateSms,
      };
      if (updates.eventPopupSalesmateSms.testDestinations !== undefined) {
        updated.eventPopupSalesmateSms.testDestinations = {
          ...updated.eventPopupSalesmateSms.testDestinations,
          ...updates.eventPopupSalesmateSms.testDestinations,
        };
      }
      if (updates.eventPopupSalesmateSms.sms) {
        updated.eventPopupSalesmateSms.sms = updates.eventPopupSalesmateSms.sms;
      }
      if (updates.eventPopupSalesmateSms.salesmateTags !== undefined) {
        updated.eventPopupSalesmateSms.salesmateTags = Array.isArray(updates.eventPopupSalesmateSms.salesmateTags)
          ? updates.eventPopupSalesmateSms.salesmateTags
          : [];
      }
    }

    if (updates.jotformClientSync !== undefined) {
      updated.jotformClientSync = {
        ...updated.jotformClientSync,
        ...updates.jotformClientSync,
      };
      if (updates.jotformClientSync.jotformFormIds !== undefined) {
        updated.jotformClientSync.jotformFormIds = Array.isArray(updates.jotformClientSync.jotformFormIds)
          ? updates.jotformClientSync.jotformFormIds
          : [];
      }
    }

    if (updates.lodgifyClientSync !== undefined) {
      updated.lodgifyClientSync = {
        ...updated.lodgifyClientSync,
        ...updates.lodgifyClientSync,
      };
    }

    if (updates.salesmateFormSync !== undefined) {
      updated.salesmateFormSync = {
        ...updated.salesmateFormSync,
        ...updates.salesmateFormSync,
      };
    }

    await setConfig(updated);

    return NextResponse.json({ success: true, config: updated });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update config", details: err.message },
      { status: 500 }
    );
  }
}
