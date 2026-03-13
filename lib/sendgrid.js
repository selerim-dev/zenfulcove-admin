import sgMail from "@sendgrid/mail";
import { SENDGRID_API_KEY } from "@/config/keys";

sgMail.setApiKey(SENDGRID_API_KEY);

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

/**
 * Fetch all contact emails from a SendGrid contact list.
 * Uses the Marketing API v3.
 * @param {string} listId  The SendGrid contact list ID
 * @returns {string[]}     Array of email addresses
 */
export async function getContactsFromList(listId) {
  // Step 1: Get contacts in the list
  const res = await fetch(
    `https://api.sendgrid.com/v3/marketing/lists/${listId}/contacts?contact_sample_size=0`,
    {
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`SendGrid list API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  // The contacts endpoint returns { contact_count, contacts: [...] }
  // For large lists, use the export contacts endpoint instead
  if (data.contacts && data.contacts.length > 0) {
    return data.contacts.map((c) => c.email).filter(Boolean);
  }

  // For larger lists, fall back to the full contacts query
  // using a SGQL search filtered by list ID
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
    throw new Error(
      `SendGrid search API error: ${searchRes.status} ${searchRes.statusText}`
    );
  }

  const searchData = await searchRes.json();
  return (searchData.result || []).map((c) => c.email).filter(Boolean);
}
