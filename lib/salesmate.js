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

export async function createSalesmateContact({ contact, leadSource, tags }) {
  const settings = validateSalesmateConfig();
  const payload = buildPayload({ contact, leadSource, tags });

  if (!payload.email && !payload.mobile && !payload.phone) {
    throw new Error("Cannot create Salesmate contact without email or phone.");
  }

  const res = await fetch(`https://${settings.domain}.salesmate.io/apis/contact/v4`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      accessToken: settings.sessionKey,
      "x-linkname": settings.linkName,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok || data?.Status === "failure") {
    const detail = data?.Error?.Message || text || `${res.status} ${res.statusText}`;
    throw new Error(`Salesmate contact create failed: ${detail}`);
  }

  return {
    id: extractSalesmateId(data),
    data,
  };
}
