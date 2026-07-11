import MailComposer from "nodemailer/lib/mail-composer/index.js";

// Builds RFC-compliant MIME messages for the Gmail API. Nodemailer MailComposer is used ONLY to
// generate the MIME bytes — there is no SMTP transport configured anywhere.

export function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Strip CR/LF from header-bound single-line values to prevent header injection.
function sanitizeHeaderValue(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function toAddressField(list) {
  if (!list) return undefined;
  const arr = Array.isArray(list) ? list : [list];
  const cleaned = arr
    .map((entry) => {
      if (!entry) return "";
      if (typeof entry === "string") return sanitizeHeaderValue(entry);
      const email = sanitizeHeaderValue(entry.email || entry.address);
      const name = sanitizeHeaderValue(entry.name);
      if (!email) return "";
      return name ? `${name} <${email}>` : email;
    })
    .filter(Boolean);
  return cleaned.length ? cleaned.join(", ") : undefined;
}

export function buildMimeMessage(options = {}) {
  const {
    from,
    to,
    cc,
    bcc,
    replyTo,
    subject,
    text,
    html,
    inReplyTo,
    references,
    messageId,
    attachments
  } = options;

  const mailOptions = {
    from: toAddressField(from),
    to: toAddressField(to),
    cc: toAddressField(cc),
    bcc: toAddressField(bcc),
    replyTo: toAddressField(replyTo),
    subject: sanitizeHeaderValue(subject),
    text: text || undefined,
    html: html || undefined,
    inReplyTo: inReplyTo ? sanitizeHeaderValue(inReplyTo) : undefined,
    references: Array.isArray(references)
      ? references.map(sanitizeHeaderValue).filter(Boolean).join(" ")
      : (references ? sanitizeHeaderValue(references) : undefined),
    messageId: messageId ? sanitizeHeaderValue(messageId) : undefined,
    attachments: Array.isArray(attachments) && attachments.length
      ? attachments.map((att) => ({
          filename: sanitizeHeaderValue(att.filename) || "attachment",
          content: att.content,
          encoding: att.encoding,
          contentType: att.mimeType || att.contentType || undefined,
          cid: att.cid || undefined
        }))
      : undefined
  };

  return new Promise((resolve, reject) => {
    new MailComposer(mailOptions).compile().build((error, message) => {
      if (error) reject(error);
      else resolve(message);
    });
  });
}

// Compiles the MIME message and returns the Gmail-API-ready base64url `raw` string.
export async function buildRawGmailMessage(options = {}) {
  const mime = await buildMimeMessage(options);
  return toBase64Url(mime);
}
