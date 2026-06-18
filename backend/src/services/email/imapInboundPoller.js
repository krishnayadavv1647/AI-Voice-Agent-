import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import EmailMessage from "../../models/EmailMessage.js";
import EmailThread from "../../models/EmailThread.js";
import Lead from "../../models/Lead.js";

let isPolling = false;
let pollInterval = null;

function clean(value) {
  return value ? String(value).trim() : "";
}

function normalizeEmail(value = "") {
  return clean(value).replace(/^.*<([^>]+)>.*$/, "$1").toLowerCase();
}

export function normalizeEmailSubject(subject = "") {
  return clean(subject)
    .replace(/^\s*(re|fw|fwd)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function maskEmail(email = "") {
  return normalizeEmail(email).replace(/(.{2}).+(@.+)/, "$1***$2") || "missing";
}

function mailboxUserEmail() {
  return normalizeEmail(process.env.IMAP_USER || process.env.FROM_EMAIL);
}

function imapConnectionConfig() {
  const imapHost = process.env.IMAP_HOST || "imap.gmail.com";
  const imapPort = Number(process.env.IMAP_PORT || 993);
  const imapSecure = String(process.env.IMAP_SECURE || "true") !== "false";
  return { imapHost, imapPort, imapSecure };
}

function htmlToText(html = "") {
  return clean(String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function parsedAddress(addressList) {
  return normalizeEmail(addressList?.value?.[0]?.address || addressList?.text || "");
}

function looksPositive(text = "") {
  return /\b(interested|yes|sure|sounds good|book|schedule|demo|call me|let'?s talk|available|send details)\b/i.test(text);
}

function looksNegative(text = "") {
  return /\b(unsubscribe|not interested|remove me|stop emailing|stop|do not contact|don'?t contact|no thanks|not relevant)\b/i.test(text);
}

function looksUnsubscribe(text = "") {
  return /\b(unsubscribe|remove me|stop emailing|stop|do not contact|don'?t contact)\b/i.test(text);
}

async function updateLeadFromReply(lead, body) {
  if (!lead) return;

  if (looksNegative(body)) {
    lead.status = "not_interested";
    if (looksUnsubscribe(body)) {
      lead.emailUnsubscribed = true;
      lead.emailUnsubscribedAt = lead.emailUnsubscribedAt || new Date();
    }
  } else if (looksPositive(body)) {
    lead.status = "interested";
  } else {
    lead.status = "contacted";
  }

  await lead.save();
}

async function findThreadForLead({ lead, normalizedSubject }) {
  if (!lead) return null;

  const threads = await EmailThread.find({
    userId: lead.userId,
    leadId: lead._id
  }).sort({ lastMessageAt: -1 }).limit(20);

  return threads.find((thread) => {
    const threadSubject = thread.normalizedSubject || normalizeEmailSubject(thread.subject);
    return threadSubject && threadSubject === normalizedSubject;
  }) || threads[0] || null;
}

async function findThreadWithoutLead({ fromEmail, toEmail, normalizedSubject }) {
  const emailChecks = [fromEmail, toEmail].filter(Boolean);
  if (!emailChecks.length || !normalizedSubject) return null;

  const threads = await EmailThread.find({
    userId: { $ne: null },
    $or: [
      { toEmail: { $in: emailChecks } },
      { fromEmail: { $in: emailChecks } }
    ]
  }).sort({ lastMessageAt: -1 }).limit(50);

  return threads.find((thread) => {
    const threadSubject = thread.normalizedSubject || normalizeEmailSubject(thread.subject);
    return threadSubject === normalizedSubject;
  }) || null;
}

export async function findInboundEmailMatch({ fromEmail, subject, userId } = {}) {
  const normalizedFromEmail = normalizeEmail(fromEmail);
  const normalizedSubject = normalizeEmailSubject(subject);
  const leadQuery = { email: normalizedFromEmail };
  if (userId) leadQuery.userId = userId;

  const lead = normalizedFromEmail ? await Lead.findOne(leadQuery).sort({ updatedAt: -1 }) : null;
  if (lead) {
    const thread = await findThreadForLead({ lead, normalizedSubject });
    return {
      matchedThread: thread,
      matchedLead: lead,
      reason: thread
        ? "lead email matched and latest lead thread selected"
        : "lead email matched, but no existing thread was found"
    };
  }

  const threadQuery = {
    userId: { $ne: null },
    $or: [{ toEmail: normalizedFromEmail }, { fromEmail: normalizedFromEmail }]
  };
  if (userId) threadQuery.userId = userId;

  const threads = await EmailThread.find(threadQuery).sort({ lastMessageAt: -1 }).limit(50);
  const thread = threads.find((item) => (item.normalizedSubject || normalizeEmailSubject(item.subject)) === normalizedSubject) || null;

  return {
    matchedThread: thread,
    matchedLead: null,
    reason: thread
      ? "existing user-owned thread email and normalized subject matched"
      : "no matching lead or user-owned thread found"
  };
}

async function resolveInboundThread({ fromEmail, toEmail, subject, normalizedSubject, receivedAt }) {
  const lead = await Lead.findOne({ email: fromEmail }).sort({ updatedAt: -1 });

  if (lead) {
    console.info("[imap] lead matched", { leadId: String(lead._id), fromEmail: maskEmail(fromEmail) });
    let thread = await findThreadForLead({ lead, normalizedSubject });

    if (thread) {
      console.info("[imap] thread matched", { threadId: String(thread._id), reason: "lead" });
      return { lead, thread };
    }

    thread = await EmailThread.create({
      userId: lead.userId,
      agentId: lead.agentId,
      leadId: lead._id,
      subject,
      normalizedSubject,
      fromEmail: toEmail || mailboxUserEmail(),
      toEmail: fromEmail,
      replyToEmail: mailboxUserEmail(),
      status: "needs_reply",
      lastMessageAt: receivedAt
    });
    console.info("[imap] thread matched", { threadId: String(thread._id), reason: "created for matched lead" });
    return { lead, thread };
  }

  const thread = await findThreadWithoutLead({ fromEmail, toEmail, normalizedSubject });
  if (thread) {
    console.info("[imap] thread matched", { threadId: String(thread._id), reason: "email and subject" });
    return { lead: null, thread };
  }

  console.info("[imap] no matching lead/thread found, skipping email", {
    fromEmail: maskEmail(fromEmail),
    subject: normalizedSubject
  });
  return { lead: null, thread: null };
}

async function importParsedEmail({ parsed, uid }) {
  const fromEmail = parsedAddress(parsed.from);
  const toEmail = parsedAddress(parsed.to) || mailboxUserEmail();
  const subject = clean(parsed.subject) || "No subject";
  const normalizedSubject = normalizeEmailSubject(subject);
  const textBody = clean(parsed.text);
  const htmlBody = clean(parsed.html);
  const body = textBody || htmlToText(htmlBody);
  const messageId = clean(parsed.messageId) || `imap-${uid}`;
  const receivedAt = parsed.date || new Date();

  console.info("[imap] parsed email", {
    uid,
    messageId,
    fromEmail: maskEmail(fromEmail),
    toEmail: maskEmail(toEmail),
    subject: normalizedSubject,
    receivedAt
  });

  const duplicate = await EmailMessage.findOne({ provider: "imap", providerMessageId: messageId });
  if (duplicate) {
    console.info("[imap] duplicate skipped", { messageId, threadId: String(duplicate.threadId) });
    return { imported: false, duplicate: true, skippedNoMatch: false };
  }

  const { lead, thread } = await resolveInboundThread({ fromEmail, toEmail, subject, normalizedSubject, receivedAt });
  if (!thread?.userId) return { imported: false, duplicate: false, skippedNoMatch: true };

  const message = await EmailMessage.create({
    userId: thread.userId,
    threadId: thread._id,
    agentId: thread.agentId,
    leadId: thread.leadId,
    campaignId: thread.campaignId,
    direction: "inbound",
    fromEmail,
    toEmail,
    subject,
    body,
    textBody,
    htmlBody,
    provider: "imap",
    providerMessageId: messageId,
    receivedAt,
    status: "received",
    rawPayload: { uid, mailbox: "INBOX" }
  });

  thread.status = "needs_reply";
  thread.lastMessageAt = receivedAt;
  thread.normalizedSubject = thread.normalizedSubject || normalizedSubject;
  thread.replyToEmail = thread.replyToEmail || mailboxUserEmail();
  await thread.save();
  await updateLeadFromReply(lead || (thread.leadId ? await Lead.findById(thread.leadId) : null), body);

  console.info("[imap] inbound imported", {
    messageId: String(message._id),
    threadId: String(thread._id),
    fromEmail: maskEmail(fromEmail)
  });

  return { imported: true, duplicate: false, skippedNoMatch: false };
}

export async function pollInboundEmails({ throwOnError = false } = {}) {
  const { imapHost, imapPort, imapSecure } = imapConnectionConfig();
  const stats = {
    success: false,
    host: imapHost,
    port: imapPort,
    secure: imapSecure,
    fetchedCount: 0,
    importedCount: 0,
    duplicateCount: 0,
    skippedNoMatchCount: 0,
    error: ""
  };

  if (isPolling) return { ...stats, success: true, skipped: true, reason: "poll already running" };
  isPolling = true;

  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_APP_PASSWORD;
  if (!user || !pass) {
    isPolling = false;
    stats.error = "IMAP_USER or IMAP_APP_PASSWORD missing. Poller disabled.";
    console.warn("[imap] IMAP_USER or IMAP_APP_PASSWORD missing. Poller disabled.");
    if (throwOnError) throw new Error(stats.error);
    return stats;
  }

  console.log("[imap] connecting config", {
    host: imapHost,
    port: imapPort,
    secure: imapSecure,
    user: maskEmail(user)
  });

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapSecure,
    auth: { user, pass },
    logger: false,
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 60000
  });

  client.on("error", (error) => {
    stats.error = stats.error || error.message;
    console.error("[imap] connection failed", {
      host: imapHost,
      port: imapPort,
      secure: imapSecure,
      code: error.code,
      message: error.message
    });
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const emailIds = await client.search({ since });
      stats.fetchedCount = emailIds.length;
      console.info("[imap] fetched emails count", { count: emailIds.length, since });

      for await (const message of client.fetch(emailIds, { source: true, uid: true })) {
        try {
          const parsed = await simpleParser(message.source);
          const result = await importParsedEmail({ parsed, uid: message.uid });

          if (result.imported) stats.importedCount += 1;
          if (result.duplicate) stats.duplicateCount += 1;
          if (result.skippedNoMatch) stats.skippedNoMatchCount += 1;
        } catch (error) {
          stats.error = stats.error || error.message;
          console.error("[imap] message import failed", { uid: message.uid, message: error.message });
        }
      }
    } finally {
      lock.release();
    }

    stats.success = !stats.error;
    return stats;
  } catch (error) {
    stats.error = error.message;
    console.error("[imap] connection failed", {
      host: imapHost,
      port: imapPort,
      secure: imapSecure,
      code: error.code,
      message: error.message
    });
    if (throwOnError) throw error;
    return stats;
  } finally {
    await client.logout().catch((error) => {
      stats.error = stats.error || error.message;
    });
    isPolling = false;
  }
}

export function startImapInboundPoller() {
  if (process.env.EMAIL_INBOUND_MODE !== "imap") return;
  if (pollInterval) return;

  const intervalSeconds = Math.max(15, Number(process.env.IMAP_POLL_INTERVAL_SECONDS || 30));
  console.info("[imap] auto poll started", {
    mailbox: maskEmail(mailboxUserEmail()),
    intervalSeconds
  });

  const runAutoPoll = async () => {
    console.info("[imap] auto poll tick");
    const result = await pollInboundEmails();
    console.info("[imap] imported count", { importedCount: result.importedCount || 0 });
  };

  runAutoPoll();
  pollInterval = setInterval(() => {
    runAutoPoll();
  }, intervalSeconds * 1000);
}
