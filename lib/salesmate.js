import {
  SALESMATE_DOMAIN,
  SALESMATE_LINK_NAME,
  SALESMATE_OWNER_ID,
  SALESMATE_SESSION_KEY,
} from "@/config/keys";

function cleanDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.salesmate\.io$/, "");
}

function splitName(contact) {
  const firstName = String(contact?.firstName || contact?.first_name || "").trim();
  const lastName = String(contact?.lastName || contact?.last_name || "").trim();
  const fullName = String(contact?.fullName || contact?.name || "").trim();

  if (firstName || lastName) {
    return {
      firstName,
      lastName: lastName || firstName || "Event Popup",
    };
  }

  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    return {
      firstName: parts.slice(0, -1).join(" "),
      lastName: parts.at(-1) || "Event Popup",
    };
  }

  return {
    firstName: "",
    lastName: "Event Popup",
  };
}

function getSalesmateSettings() {
  const domain = cleanDomain(SALESMATE_DOMAIN || SALESMATE_LINK_NAME);
  const linkName = String(SALESMATE_LINK_NAME || (domain ? `${domain}.salesmate.io` : "")).trim();
  const sessionKey = String(SALESMATE_SESSION_KEY || "").trim();
  const ownerId = String(SALESMATE_OWNER_ID || "").trim();

  return {
    domain,
    linkName: linkName.includes(".salesmate.io") ? linkName : `${linkName}.salesmate.io`,
    sessionKey,
    ownerId,
  };
}

export function validateSalesmateConfig() {
  const settings = getSalesmateSettings();
  if (!settings.domain || !settings.linkName || !settings.sessionKey) {
    throw new Error(
      "Salesmate env vars are incomplete. Set SALESMATE_DOMAIN, SALESMATE_LINK_NAME, and SALESMATE_SESSION_KEY."
    );
  }
  return settings;
}

function buildPayload({ contact, leadSource, tags }) {
  const { firstName, lastName } = splitName(contact);
  const payload = {
    firstName,
    lastName,
    email: String(contact?.email || "").trim().toLowerCase(),
    mobile: String(contact?.phone || contact?.phone_number || "").trim(),
    phone: String(contact?.phone || contact?.phone_number || "").trim(),
    tags: (Array.isArray(tags) ? tags : [])
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .join(","),
  };

  if (leadSource) {
    payload.source = String(leadSource).trim();
    payload.leadSource = String(leadSource).trim();
  }

  const { ownerId } = getSalesmateSettings();
  if (ownerId) {
    payload.owner = Number(ownerId);
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
  );
}

function extractSalesmateId(data) {
  return (
    data?.Data?.id ||
    data?.Data?.contact?.id ||
    data?.Data?.Contact?.id ||
    data?.id ||
    data?.contact?.id ||
    ""
  );
}

function salesmateHeaders(settings) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    accessToken: settings.sessionKey,
    "x-linkname": settings.linkName,
  };
}

async function salesmateRequest(settings, path, options = {}) {
  const res = await fetch(`https://${settings.domain}.salesmate.io${path}`, {
    ...options,
    headers: {
      ...salesmateHeaders(settings),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok || data?.Status === "failure") {
    const detail = data?.Error?.Message || text || `${res.status} ${res.statusText}`;
    const error = new Error(`Salesmate request failed: ${detail}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

function searchRows(data) {
  const candidates = [
    data?.Data?.data,
    data?.Data?.records,
    data?.Data,
    data?.data,
    data?.records,
  ];
  return candidates.find(Array.isArray) || [];
}

function contactRecord(data) {
  return data?.Data?.contact || data?.Data?.Contact || data?.Data || data?.contact || data || {};
}

function tagNames(value) {
  const entries = Array.isArray(value) ? value : String(value || "").split(",");
  return entries
    .map((entry) =>
      typeof entry === "object" && entry
        ? String(entry.name || entry.value || entry.label || "").trim()
        : String(entry || "").trim()
    )
    .filter(Boolean);
}

function mergeTags(existing, incoming) {
  const tags = [...tagNames(existing), ...tagNames(incoming)];
  const seen = new Set();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getSalesmateContact(settings, contactId) {
  if (!contactId) return null;
  try {
    const data = await salesmateRequest(settings, `/apis/contact/v4/${contactId}`);
    return contactRecord(data);
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

async function findSalesmateContactByEmail(settings, email) {
  if (!email) return null;
  const data = await salesmateRequest(
    settings,
    "/apis/contact/v4/search?rows=1&from=0",
    {
      method: "POST",
      body: JSON.stringify({
        displayingFields: [
          "contact.id",
          "contact.email",
          "contact.firstName",
          "contact.lastName",
          "contact.mobile",
          "contact.phone",
          "contact.tags",
          "contact.owner.id",
        ],
        filterQuery: {
          group: {
            operator: "AND",
            rules: [
              {
                condition: "EQUALS",
                moduleName: "Contact",
                field: {
                  fieldName: "contact.email",
                  displayName: "Email",
                  type: "Text",
                },
                data: email,
                eventType: "String",
              },
            ],
          },
        },
        sort: { fieldName: "", order: "" },
        moduleId: 1,
        reportType: "get_data",
        getRecordsCount: true,
      }),
    }
  );
  return searchRows(data)[0] || null;
}

export async function createSalesmateContact({ contact, leadSource, tags }) {
  const settings = validateSalesmateConfig();
  const payload = buildPayload({ contact, leadSource, tags });

  if (!payload.email && !payload.mobile && !payload.phone) {
    throw new Error("Cannot create Salesmate contact without email or phone.");
  }

  const data = await salesmateRequest(settings, "/apis/contact/v4", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    id: extractSalesmateId(data),
    data,
  };
}

/**
 * Update an existing Salesmate contact when one is known (or can be found by
 * email), otherwise create it. Existing manual tags are preserved.
 */
export async function upsertSalesmateContact({
  contact,
  leadSource,
  tags,
  contactId = "",
}) {
  const settings = validateSalesmateConfig();
  const payload = buildPayload({ contact, leadSource, tags });
  if (!payload.email && !payload.mobile && !payload.phone) {
    throw new Error("Cannot upsert Salesmate contact without email or phone.");
  }

  let existing = await getSalesmateContact(settings, contactId);
  if (!existing && payload.email) {
    existing = await findSalesmateContactByEmail(settings, payload.email);
  }

  const existingId = extractSalesmateId(existing);
  if (!existingId) {
    const created = await createSalesmateContact({ contact, leadSource, tags });
    return { ...created, action: "created" };
  }

  const mergedTags = mergeTags(existing?.tags, payload.tags);
  const data = await salesmateRequest(settings, `/apis/contact/v4/${existingId}`, {
    method: "PUT",
    body: JSON.stringify({
      ...payload,
      ...(mergedTags.length ? { tags: mergedTags.join(",") } : {}),
      owner: payload.owner || existing?.owner?.id || existing?.owner,
      lastName: payload.lastName || existing?.lastName || "Website Contact",
    }),
  });

  return { id: String(existingId), data, action: "updated" };
}
