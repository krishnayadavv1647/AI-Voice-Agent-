import EmailMessage from "../../models/EmailMessage.js";
import EmailThread from "../../models/EmailThread.js";
import { normalizeEmailSubject } from "../email/imapInboundPoller.js";
import { emitToUser } from "../emailRealtime.service.js";

function htmlFrom(text) {
  return `<html><body>${String(text || "").replace(/\n/g, "<br>")}</body></html>`;
}

function toAddressArray(list) {
  if (!list) return undefined;
  const arr = (Array.isArray(list) ? list : [list])
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") return { email: entry.toLowerCase() };
      return { email: String(entry.email || entry.address || "").toLowerCase(), name: entry.name };
    })
    .filter((entry) => entry && entry.email);
  return arr.length ? arr : undefined;
}

// Persists an outbound Gmail message (compose / reply / campaign) into EmailThread + EmailMessage.
// The Gmail thread id anchors threading; the next sync dedupes the SENT copy by providerMessageId.
export async function storeSentGmailMessage({
  integration,
  existingThread,
  agentId,
  leadId,
  campaignId,
  toEmail,
  toName,
  cc,
  bcc,
  subject,
  text,
  html,
  inReplyTo,
  references,
  sendResult,
  source
}) {
  const userId = integration.userId;
  const fromEmail = String(integration.gmail?.email || "").toLowerCase();
  const sentAt = new Date();
  const normalizedSubject = normalizeEmailSubject(subject);

  let thread = existingThread || null;
  if (!thread && sendResult?.threadId) {
    thread = await EmailThread.findOne({ userId, "threadHeaders.providerThreadId": sendResult.threadId });
  }
  if (!thread) {
    thread = await EmailThread.create({
      userId,
      emailIntegrationId: integration._id,
      agentId,
      leadId,
      campaignId,
      provider: "gmail",
      subject,
      normalizedSubject,
      fromEmail,
      toEmail: String(toEmail || "").toLowerCase(),
      replyToEmail: fromEmail,
      threadHeaders: {
        messageId: sendResult?.internetMessageId || "",
        references: references || [],
        providerThreadId: sendResult?.threadId || ""
      },
      status: "open",
      lastMessageAt: sentAt
    });
  }

  const message = await EmailMessage.create({
    userId,
    emailIntegrationId: integration._id,
    threadId: thread._id,
    agentId: agentId || thread.agentId,
    leadId: leadId || thread.leadId,
    campaignId: campaignId || thread.campaignId,
    direction: "outbound",
    fromEmail,
    toEmail: String(toEmail || "").toLowerCase(),
    from: [{ email: fromEmail, name: integration.gmail?.displayName || "" }],
    to: toAddressArray(toEmail ? [{ email: toEmail, name: toName }] : []),
    cc: toAddressArray(cc),
    bcc: toAddressArray(bcc),
    subject,
    body: text,
    text,
    textBody: text,
    html: html || htmlFrom(text),
    htmlBody: html || htmlFrom(text),
    provider: "gmail",
    providerMessageId: sendResult?.id || "",
    providerThreadId: sendResult?.threadId || "",
    internetMessageId: sendResult?.internetMessageId || undefined,
    inReplyTo: inReplyTo || "",
    references: references?.length ? references : undefined,
    labelIds: sendResult?.labelIds?.length ? sendResult.labelIds : ["SENT"],
    sentAt,
    isRead: true,
    status: "sent",
    rawPayload: source ? { source } : undefined
  });

  // Anchor + refresh thread.
  if (!thread.threadHeaders?.providerThreadId && sendResult?.threadId) {
    thread.threadHeaders = { ...(thread.threadHeaders || {}), providerThreadId: sendResult.threadId };
  }
  thread.provider = "gmail";
  thread.emailIntegrationId = thread.emailIntegrationId || integration._id;
  thread.agentId = thread.agentId || agentId;
  thread.leadId = thread.leadId || leadId;
  thread.campaignId = thread.campaignId || campaignId;
  thread.fromEmail = thread.fromEmail || fromEmail;
  thread.toEmail = thread.toEmail || String(toEmail || "").toLowerCase();
  thread.normalizedSubject = thread.normalizedSubject || normalizedSubject;
  thread.replyToEmail = thread.replyToEmail || fromEmail;
  thread.labelIds = Array.from(new Set([...(thread.labelIds || []), "SENT"]));
  thread.messagesCount = (thread.messagesCount || 0) + 1;
  thread.status = source === "reply" ? "replied" : (thread.status === "closed" ? "closed" : thread.status || "open");
  thread.lastMessageAt = sentAt;
  await thread.save();

  emitToUser(userId, "email:sent", { threadId: thread._id, messageId: message._id, sentAt, provider: "gmail" });
  return { thread, message };
}
