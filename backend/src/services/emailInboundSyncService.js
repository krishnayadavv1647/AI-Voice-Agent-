import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import EmailIntegration from "../models/EmailIntegration.js";
import EmailMessage from "../models/EmailMessage.js";
import EmailThread from "../models/EmailThread.js";
import Lead from "../models/Lead.js";
import { decryptCredential } from "./credentialEncryptionService.js";
import { emitToUser } from "./emailRealtime.service.js";
import { runGmailSync } from "./gmail/gmailSync.service.js";

// Provider router: Gmail-connected integrations sync through the Gmail API; legacy IMAP-connected
// integrations continue to use the ImapFlow path below.
function isGmailIntegration(integration) {
  return Boolean(integration?.gmail?.connected) || integration?.inboundProvider === "gmail_oauth";
}

const activeSyncs = new Set();

function clean(value) {
  return value ? String(value).trim() : "";
}

function normalizeEmail(value = "") {
  return clean(value).replace(/^.*<([^>]+)>.*$/, "$1").toLowerCase();
}

export function normalizeSubject(subject = "") {
  return clean(subject)
    .replace(/^\s*((re|fw|fwd)\s*:\s*)+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function addressList(addresses) {
  return (addresses?.value || []).map((item) => item.address).filter(Boolean).map(normalizeEmail);
}

function firstAddress(addresses) {
  return addressList(addresses)[0] || normalizeEmail(addresses?.text || "");
}

export function createImapClient(integration) {
  const pass = decryptCredential(integration.inbound.passwordEncrypted);
  return new ImapFlow({
    host: integration.inbound.host,
    port: Number(integration.inbound.port || 993),
    secure: integration.inbound.secure !== false,
    auth: { user: integration.inbound.username, pass },
    logger: false,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 60000
  });
}

export async function testImapConnection({ host, port, secure, username, password, mailbox = "INBOX" }) {
  const client = new ImapFlow({
    host,
    port: Number(port || 993),
    secure: secure !== false,
    auth: { user: username, pass: password },
    logger: false,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 60000
  });
  await client.connect();
  const lock = await client.getMailboxLock(mailbox);
  lock.release();
  await client.logout();
}

async function matchThread({ userId, fromEmail, toEmail, subject, messageId, inReplyTo, references }) {
  const ids = [inReplyTo, ...references].map(clean).filter(Boolean);
  if (ids.length) {
    const matchedMessage = await EmailMessage.findOne({ userId, internetMessageId: { $in: ids } }).sort({ createdAt: -1 });
    if (matchedMessage) return EmailThread.findOne({ _id: matchedMessage.threadId, userId });
  }
  if (messageId) {
    const matchedProvider = await EmailMessage.findOne({ userId, providerMessageId: messageId });
    if (matchedProvider) return EmailThread.findOne({ _id: matchedProvider.threadId, userId });
  }
  const normalizedSubject = normalizeSubject(subject);
  if (normalizedSubject && fromEmail) {
    return EmailThread.findOne({
      userId,
      normalizedSubject,
      $or: [{ toEmail: fromEmail }, { fromEmail }, { replyToEmail: toEmail }]
    }).sort({ lastMessageAt: -1 });
  }
  return null;
}

async function createThreadForInbound({ integration, parsed, fromEmail, toEmail, subject, receivedAt }) {
  const userId = integration.userId;
  const lead = fromEmail ? await Lead.findOne({ userId, email: fromEmail }).sort({ updatedAt: -1 }) : null;
  return EmailThread.create({
    userId,
    agentId: lead?.agentId,
    leadId: lead?._id,
    subject,
    normalizedSubject: normalizeSubject(subject),
    fromEmail: toEmail || integration.brevo?.senderEmail || "",
    toEmail: fromEmail,
    replyToEmail: integration.inbound.email,
    status: "needs_reply",
    lastMessageAt: receivedAt,
    threadHeaders: {
      messageId: clean(parsed.messageId),
      references: parsed.references || []
    }
  });
}

async function importMessage({ integration, parsed, uid, uidValidity }) {
  const userId = integration.userId;
  const fromEmail = firstAddress(parsed.from);
  const toEmails = addressList(parsed.to);
  const toEmail = toEmails[0] || normalizeEmail(integration.inbound.email);
  const subject = clean(parsed.subject) || "No subject";
  const textBody = clean(parsed.text);
  const htmlBody = clean(parsed.html);
  const body = textBody || clean(String(htmlBody).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const internetMessageId = clean(parsed.messageId) || `imap-${integration._id}-${uidValidity}-${uid}`;
  const references = Array.isArray(parsed.references) ? parsed.references.map(clean).filter(Boolean) : clean(parsed.references).split(/\s+/).filter(Boolean);
  const inReplyTo = clean(parsed.inReplyTo);
  const receivedAt = parsed.date || new Date();

  const duplicate = await EmailMessage.findOne({
    userId,
    $or: [
      { internetMessageId },
      { emailIntegrationId: integration._id, imapUidValidity: uidValidity, imapUid: uid }
    ]
  });
  if (duplicate) return { imported: false, duplicate: true };

  let thread = await matchThread({ userId, fromEmail, toEmail, subject, messageId: internetMessageId, inReplyTo, references });
  if (!thread) thread = await createThreadForInbound({ integration, parsed, fromEmail, toEmail, subject, receivedAt });

  const message = await EmailMessage.create({
    userId,
    emailIntegrationId: integration._id,
    threadId: thread._id,
    agentId: thread.agentId,
    leadId: thread.leadId,
    campaignId: thread.campaignId,
    direction: "inbound",
    from: [{ email: fromEmail }],
    to: toEmails.map((email) => ({ email })),
    fromEmail,
    toEmail,
    subject,
    body,
    textBody,
    htmlBody,
    text: textBody,
    html: htmlBody,
    provider: integration.inboundProvider || "imap",
    providerMessageId: internetMessageId,
    internetMessageId,
    inReplyTo,
    references,
    receivedAt,
    status: "received",
    isRead: false,
    imapUid: uid,
    imapUidValidity: uidValidity,
    rawPayload: { mailbox: integration.inbound.mailbox || "INBOX" }
  });

  thread.status = "needs_reply";
  thread.lastMessageAt = receivedAt;
  thread.normalizedSubject = thread.normalizedSubject || normalizeSubject(subject);
  thread.replyToEmail = thread.replyToEmail || integration.inbound.email;
  await thread.save();

  const unreadCount = await EmailMessage.countDocuments({ userId, direction: "inbound", status: "received", $or: [{ readAt: null }, { readAt: { $exists: false } }] });
  emitToUser(userId, "email:received", { threadId: thread._id, messageId: message._id, receivedAt, unreadCount });
  emitToUser(userId, "email:unread-count", { unreadCount });
  return { imported: true, duplicate: false, threadId: thread._id, messageId: message._id };
}

export async function syncEmailIntegration(integrationOrId) {
  const integration = typeof integrationOrId === "string"
    ? await EmailIntegration.findById(integrationOrId)
    : integrationOrId;

  // Gmail takes precedence once connected.
  if (isGmailIntegration(integration)) {
    return runGmailSync(integration);
  }

  if (!integration?.inbound?.connected || integration.inbound.syncEnabled === false) {
    return { success: false, importedCount: 0, duplicateCount: 0, error: "Inbound mailbox is not connected." };
  }
  const key = String(integration._id);
  if (activeSyncs.has(key)) return { success: true, skipped: true, reason: "sync already running", importedCount: 0, duplicateCount: 0 };
  activeSyncs.add(key);

  const stats = { success: false, fetchedCount: 0, importedCount: 0, duplicateCount: 0, skippedNoMatchCount: 0, error: "" };
  const client = createImapClient(integration);
  try {
    integration.inbound.syncStatus = "syncing";
    integration.inbound.lastError = "";
    await integration.save();
    emitToUser(integration.userId, "email:sync-status", { syncStatus: "syncing" });

    await client.connect();
    const mailboxName = integration.inbound.mailbox || "INBOX";
    const lock = await client.getMailboxLock(mailboxName);
    try {
      const mailbox = client.mailbox || {};
      const uidValidity = String(mailbox.uidValidity || integration.inbound.uidValidity || "");
      if (integration.inbound.uidValidity && uidValidity && integration.inbound.uidValidity !== uidValidity) {
        integration.inbound.lastUid = 0;
      }
      const lastUid = Number(integration.inbound.lastUid || 0);
      const query = lastUid > 0 ? { uid: `${lastUid + 1}:*` } : { since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
      const ids = await client.search(query);
      stats.fetchedCount = ids.length;
      let maxUid = lastUid;
      for await (const message of client.fetch(ids, { source: true, uid: true })) {
        maxUid = Math.max(maxUid, Number(message.uid || 0));
        const parsed = await simpleParser(message.source);
        const result = await importMessage({ integration, parsed, uid: message.uid, uidValidity });
        if (result.imported) stats.importedCount += 1;
        if (result.duplicate) stats.duplicateCount += 1;
      }
      integration.inbound.lastUid = maxUid;
      integration.inbound.uidValidity = uidValidity || integration.inbound.uidValidity;
    } finally {
      lock.release();
    }

    integration.inbound.lastSyncedAt = new Date();
    integration.inbound.syncStatus = "idle";
    integration.inbound.lastError = "";
    await integration.save();
    stats.success = true;
    emitToUser(integration.userId, "email:sync-status", { syncStatus: "idle", importedCount: stats.importedCount });
    return stats;
  } catch (error) {
    integration.inbound.syncStatus = "error";
    integration.inbound.lastError = "Mailbox sync failed. Check your mailbox connection.";
    await integration.save().catch(() => {});
    stats.error = integration.inbound.lastError;
    emitToUser(integration.userId, "email:sync-status", { syncStatus: "error", message: stats.error });
    return stats;
  } finally {
    await client.logout().catch(() => {});
    activeSyncs.delete(key);
  }
}

export async function syncDueEmailIntegrations() {
  const integrations = await EmailIntegration.find({
    $or: [
      { "gmail.connected": true, "gmail.syncEnabled": true },
      { "inbound.connected": true, "inbound.syncEnabled": true, "settings.autoSync": true }
    ]
  }).limit(Math.max(1, Number(process.env.EMAIL_SYNC_BATCH_SIZE || 10)));

  const results = [];
  const concurrency = Math.max(1, Number(process.env.EMAIL_SYNC_CONCURRENCY || 3));
  for (let index = 0; index < integrations.length; index += concurrency) {
    const batch = integrations.slice(index, index + concurrency);
    results.push(...await Promise.all(batch.map((integration) => syncEmailIntegration(integration))));
  }
  return { success: true, processedCount: integrations.length, results };
}
