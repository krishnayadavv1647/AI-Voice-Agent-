import { createAuthorizedGmailClient } from "./gmailOAuth.service.js";
import { buildRawGmailMessage } from "./gmailMime.service.js";
import { getHeader } from "./gmailParser.service.js";

// Sends a message through the Gmail API. The connected Gmail address is always the From, so the
// recipient sees the user's real Gmail address as sender. Never uses SMTP.
export async function sendGmailEmail(integration, params = {}) {
  const {
    to,
    cc,
    bcc,
    replyTo,
    subject,
    text,
    html,
    inReplyTo,
    references,
    threadId,
    attachments
  } = params;

  const fromEmail = integration.gmail?.email;
  const fromName = integration.gmail?.displayName || "";
  const { gmail } = createAuthorizedGmailClient(integration);

  const raw = await buildRawGmailMessage({
    from: fromName ? { name: fromName, email: fromEmail } : { email: fromEmail },
    to,
    cc,
    bcc,
    replyTo,
    subject,
    text,
    html,
    inReplyTo,
    references,
    attachments
  });

  const requestBody = { raw };
  // Passing threadId keeps the reply inside the exact Gmail conversation.
  if (threadId) requestBody.threadId = threadId;

  const { data } = await gmail.users.messages.send({ userId: "me", requestBody });

  // Grab the server-assigned Message-ID so replies to this message thread correctly later.
  let internetMessageId = "";
  try {
    const meta = await gmail.users.messages.get({
      userId: "me",
      id: data.id,
      format: "metadata",
      metadataHeaders: ["Message-ID"]
    });
    internetMessageId = getHeader(meta.data?.payload?.headers, "Message-ID");
  } catch {
    // Non-fatal: the send already succeeded.
  }

  return {
    id: data.id,
    threadId: data.threadId || threadId || "",
    labelIds: data.labelIds || [],
    internetMessageId,
    fromEmail
  };
}

// Fetches a single Gmail attachment's raw bytes (base64url) for download.
export async function fetchGmailAttachment(integration, messageId, attachmentId) {
  const { gmail } = createAuthorizedGmailClient(integration);
  const { data } = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId,
    id: attachmentId
  });
  return data?.data || "";
}
