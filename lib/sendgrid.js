import sgMail from "@sendgrid/mail";
import { SENDGRID_API_KEY } from "@/config/keys";

sgMail.setApiKey(SENDGRID_API_KEY);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a SendGrid dynamic template email.
 * @param {object} options
 * @param {string} options.to         Recipient email
 * @param {string} options.templateId SendGrid dynamic template ID
 * @param {object} options.data       Dynamic template data
 * @param {object} options.from       { email, name } sender info
 */
export async function sendTemplateEmail({ to, templateId, data, from }) {
  const msg = {
    to,
    from,
    templateId,
    dynamicTemplateData: data,
  };

  await sgMail.send(msg);
}

function uniqueEmails(contacts) {
  const seen = new Set();
  return contacts.filter((contact) => {
    const email = String(contact?.email || "").trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

/**
 * Fetch all contact emails from a SendGrid contact list.
 * Uses the Marketing API v3.
 * @param {string} listId  The SendGrid contact list ID
 * @returns {string[]}     Array of email addresses
 */
export async function getContactsFromList(listId) {
  const contacts = await getContactsFromListDetailed(listId);
  return contacts.map((c) => c.email).filter(Boolean);
}

/**
 * Fetch full contact objects from a SendGrid contact list.
 * Returns at least { email, custom_fields, first_name, last_name } when available.
 * @param {string} listId
 * @returns {object[]}
 */
export async function getContactsFromListDetailed(listId) {
  const searchRes = await fetch(
    "https://api.sendgrid.com/v3/marketing/contacts/search",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `CONTAINS(list_ids, '${listId}')`,
      }),
    }
  );

  if (!searchRes.ok) {
    const text = await searchRes.text();
    throw new Error(
      `SendGrid search API error: ${searchRes.status} ${searchRes.statusText} ${text}`
    );
  }

  const searchData = await searchRes.json();
  return uniqueEmails(searchData.result || []);
}

/**
 * Update a SendGrid contact's custom fields by email.
 * @param {object} options
 * @param {string} options.email
 * @param {object} options.customFields
 */
export async function updateContactCustomFields({ email, customFields }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Cannot update SendGrid contact without an email");
  }

  const res = await fetch("https://api.sendgrid.com/v3/marketing/contacts", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contacts: [
        {
          email: normalizedEmail,
          custom_fields: customFields,
        },
      ],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `SendGrid contact update failed: ${res.status} ${res.statusText} ${text}`
    );
  }

  const result = text ? JSON.parse(text) : {};
  const jobId = result?.job_id;

  if (!jobId) {
    return result;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 20000) {
    await sleep(1000);

    const statusRes = await fetch(
      `https://api.sendgrid.com/v3/marketing/contacts/imports/${jobId}`,
      {
        headers: {
          Authorization: `Bearer ${SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const statusText = await statusRes.text();
    if (!statusRes.ok) {
      throw new Error(
        `SendGrid import status check failed: ${statusRes.status} ${statusRes.statusText} ${statusText}`
      );
    }

    const statusData = statusText ? JSON.parse(statusText) : {};
    if (statusData.status === "completed") {
      return statusData;
    }

    if (statusData.status === "failed") {
      throw new Error(
        `SendGrid contact update import failed for ${normalizedEmail}`
      );
    }
  }

  throw new Error(
    `Timed out waiting for SendGrid contact update import to complete for ${normalizedEmail}`
  );
}
