// Pure Gmail MIME parsing helpers. No network, no googleapis — everything operates on the JSON
// payload returned by users.messages.get(format: "full"), so it is fully unit-testable.

export function decodeBase64Url(data) {
  if (!data) return "";
  const normalized = String(data).replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return "";
  }
}

export function getHeader(headers = [], name = "") {
  const target = String(name).toLowerCase();
  const found = (headers || []).find((h) => String(h?.name || "").toLowerCase() === target);
  return found ? String(found.value ?? "") : "";
}

export function getAllHeaders(headers = []) {
  const map = {};
  for (const h of headers || []) {
    if (!h?.name) continue;
    const key = String(h.name).toLowerCase();
    // Preserve multi-valued headers (e.g. Received) as arrays.
    if (map[key] === undefined) map[key] = String(h.value ?? "");
    else if (Array.isArray(map[key])) map[key].push(String(h.value ?? ""));
    else map[key] = [map[key], String(h.value ?? "")];
  }
  return map;
}

// Splits an address-list header on commas while respecting quoted display names and <angle> parts.
function splitAddressList(value = "") {
  const out = [];
  let current = "";
  let inQuotes = false;
  let inAngles = false;
  for (const char of String(value)) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "<") inAngles = true;
    else if (char === ">") inAngles = false;
    if (char === "," && !inQuotes && !inAngles) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) out.push(current);
  return out;
}

export function parseAddressHeader(value = "") {
  if (!value) return [];
  return splitAddressList(value)
    .map((raw) => {
      const token = raw.trim();
      if (!token) return null;
      const angle = token.match(/<([^>]+)>/);
      if (angle) {
        const email = angle[1].trim().toLowerCase();
        const name = token.slice(0, angle.index).trim().replace(/^"|"$/g, "").trim();
        return { name, email };
      }
      const email = token.replace(/^"|"$/g, "").trim().toLowerCase();
      return { name: "", email };
    })
    .filter((addr) => addr && addr.email);
}

export function firstAddress(value = "") {
  return parseAddressHeader(value)[0]?.email || "";
}

// Depth-first walk over every MIME part (payload + nested parts).
export function recursivelyFindMimeParts(payload, predicate, acc = []) {
  if (!payload) return acc;
  if (predicate(payload)) acc.push(payload);
  for (const part of payload.parts || []) {
    recursivelyFindMimeParts(part, predicate, acc);
  }
  return acc;
}

function collectBody(payload, mimeType) {
  // Prefer a part that is exactly this mime type and is NOT an attachment (no filename).
  const parts = recursivelyFindMimeParts(
    payload,
    (p) => p?.mimeType === mimeType && !p?.filename && p?.body?.data
  );
  return parts.map((p) => decodeBase64Url(p.body.data)).join("");
}

export function extractBodies(payload) {
  if (!payload) return { text: "", html: "" };
  // Simple, non-multipart message: body lives directly on the payload.
  if (payload.body?.data && !payload.parts) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") return { text: "", html: decoded };
    return { text: decoded, html: "" };
  }
  return {
    text: collectBody(payload, "text/plain"),
    html: collectBody(payload, "text/html")
  };
}

export function extractAttachmentMetadata(payload) {
  const parts = recursivelyFindMimeParts(
    payload,
    (p) => (p?.filename && p.filename.length > 0) || p?.body?.attachmentId
  );
  return parts
    .filter((p) => p?.body?.attachmentId || p?.filename)
    .map((p) => {
      const headers = getAllHeaders(p.headers);
      const contentId = String(headers["content-id"] || "").replace(/^<|>$/g, "");
      const disposition = String(headers["content-disposition"] || "").toLowerCase();
      return {
        attachmentId: p.body?.attachmentId || "",
        filename: p.filename || "",
        mimeType: p.mimeType || "application/octet-stream",
        size: Number(p.body?.size || 0),
        contentId,
        inline: disposition.includes("inline") || Boolean(contentId)
      };
    })
    .filter((a) => a.filename || a.attachmentId);
}

function parseReferences(value = "") {
  return String(value)
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

// Normalizes a full Gmail message into the shape the app stores. connectedEmail is the user's
// own Gmail address, used to determine outbound vs inbound direction.
export function parseGmailMessage(message, { connectedEmail = "" } = {}) {
  const payload = message?.payload || {};
  const headers = payload.headers || [];
  const labelIds = message?.labelIds || [];
  const bodies = extractBodies(payload);
  const attachments = extractAttachmentMetadata(payload);

  const fromList = parseAddressHeader(getHeader(headers, "From"));
  const toList = parseAddressHeader(getHeader(headers, "To"));
  const ccList = parseAddressHeader(getHeader(headers, "Cc"));
  const bccList = parseAddressHeader(getHeader(headers, "Bcc"));
  const replyToList = parseAddressHeader(getHeader(headers, "Reply-To"));

  const fromEmail = fromList[0]?.email || "";
  const connected = String(connectedEmail || "").toLowerCase();
  const isSentLabel = labelIds.includes("SENT");
  const isDraft = labelIds.includes("DRAFT");
  const isFromConnected = connected && fromEmail === connected;
  const direction = isSentLabel || isDraft || isFromConnected ? "outbound" : "inbound";

  const internalDateMs = Number(message?.internalDate || 0);
  const internalDate = internalDateMs ? new Date(internalDateMs) : undefined;

  const htmlBody = bodies.html || "";
  const textBody = bodies.text || (htmlBody ? htmlBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "");

  return {
    providerMessageId: message?.id || "",
    providerThreadId: message?.threadId || "",
    historyId: message?.historyId ? String(message.historyId) : "",
    labelIds,
    snippet: message?.snippet || "",
    internalDate,
    direction,
    isDraft,
    isUnread: labelIds.includes("UNREAD"),
    isStarred: labelIds.includes("STARRED"),
    subject: getHeader(headers, "Subject") || "",
    internetMessageId: getHeader(headers, "Message-ID") || getHeader(headers, "Message-Id") || "",
    inReplyTo: getHeader(headers, "In-Reply-To") || "",
    references: parseReferences(getHeader(headers, "References")),
    from: fromList,
    to: toList,
    cc: ccList,
    bcc: bccList,
    replyTo: replyToList,
    fromEmail,
    toEmail: toList[0]?.email || "",
    textBody,
    htmlBody,
    headers: getAllHeaders(headers),
    attachments,
    hasAttachments: attachments.length > 0
  };
}
