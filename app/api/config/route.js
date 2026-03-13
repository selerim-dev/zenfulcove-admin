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

    // Merge updates into current config
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

    await setConfig(updated);

    return NextResponse.json({ success: true, config: updated });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update config", details: err.message },
      { status: 500 }
    );
  }
}
