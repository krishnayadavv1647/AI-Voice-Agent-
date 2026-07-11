import EmailMessage from "../../models/EmailMessage.js";
import EmailThread from "../../models/EmailThread.js";
import Lead from "../../models/Lead.js";
import { normalizeEmailSubject } from "../email/imapInboundPoller.js";
import { emitToUser } from "../emailRealtime.service.js";
import { createAuthorizedGmailClient, markGmailErrorState } from "./gmailOAuth.service.js";
import { isGmailHistoryExpired } from "./gmailErrors.js";
import { parseGmailMessage } from "./gmailParser.service.js";

// Per-integration locks so two syncs (or two import-more calls) never run at once.
const activeSyncs = new Set();
const activeImports = new Set();

function intEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function initialQuery() {
  return process.env.GMAIL_INITIAL_SYNC_QUERY || "newer_than:90d -in:chats";
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchFullMessage(gmail, id) {
  const { data } = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  return data;
}

function counterpartyEmail(parsed) {
  return parsed.direction === "outbound" ? parsed.toEmail : parsed.fromEmail;
}

// Thread resolution order (never merge unrelated Gmail threads on subject alone):
// 1) Gmail providerThreadId  2) In-Reply-To/References  3) lead relation  4) subject fallback.
async function resolveThreadForGmail(integration, parsed) {
  const userId = integration.userId;
  const normalizedSubject = normalizeEmailSubject(parsed.subject);

  // 1) Exact Gmail thread id.
  if (parsed.providerThreadId) {
    const byThreadId = await EmailThread.findOne({
      userId,
      "threadHeaders.providerThreadId": parsed.providerThreadId
    });
    if (byThreadId) return byThreadId;
  }

  // 2) RFC Message-ID chain.
  const chainIds = [parsed.inReplyTo, ...(parsed.references || [])].filter(Boolean);
  if (chainIds.length) {
    const priorMessage = await EmailMessage.findOne({ userId, internetMessageId: { $in: chainIds } }).sort({ createdAt: -1 });
    if (priorMessage) {
      const thread = await EmailThread.findById(priorMessage.threadId);
      if (thread) return thread;
    }
  }

  // 3) Existing lead relation (matches app-created outreach threads that predate this Gmail thread).
  const partner = counterpartyEmail(parsed);
  let lead = null;
  if (partner) lead = await Lead.findOne({ userId, email: partner }).sort({ updatedAt: -1 });
  if (lead) {
    const leadThread = await EmailThread.findOne({
      userId,
      leadId: lead._id,
      $or: [
        { "threadHeaders.providerThreadId": { $in: ["", null] } },
        { "threadHeaders.providerThreadId": { $exists: false } }
      ],
      normalizedSubject
    }).sort({ lastMessageAt: -1 });
    if (leadThread) return leadThread;
  }

  // 4) Subject fallback — ONLY for app/legacy threads that have no Gmail thread id yet, and only
  // when the counterparty email matches. Prevents collapsing distinct Gmail threads together.
  if (normalizedSubject && partner) {
    const subjectThread = await EmailThread.findOne({
      userId,
      normalizedSubject,
      $or: [{ toEmail: partner }, { fromEmail: partner }],
      $and: [{
        $or: [
          { "threadHeaders.providerThreadId": { $in: ["", null] } },
          { "threadHeaders.providerThreadId": { $exists: false } }
        ]
      }]
    }).sort({ lastMessageAt: -1 });
    if (subjectThread) return subjectThread;
  }

  // Create a new thread anchored on the Gmail thread id.
  return EmailThread.create({
    userId,
    emailIntegrationId: integration._id,
    agentId: lead?.agentId,
    leadId: lead?._id,
    provider: "gmail",
    subject: parsed.subject,
    normalizedSubject,
    fromEmail: parsed.direction === "outbound" ? integration.gmail.email : parsed.fromEmail,
    toEmail: parsed.direction === "outbound" ? parsed.toEmail : integration.gmail.email,
    replyToEmail: integration.gmail.email,
    threadHeaders: {
      messageId: parsed.internetMessageId || "",
      references: parsed.references || [],
      providerThreadId: parsed.providerThreadId
    },
    labelIds: parsed.labelIds,
    snippet: parsed.snippet,
    hasAttachments: parsed.hasAttachments,
    status: parsed.direction === "inbound" ? "needs_reply" : "open",
    lastMessageAt: parsed.internalDate || new Date()
  });
}

function messageStatusFor(parsed) {
  if (parsed.isDraft) return "draft";
  if (parsed.direction === "outbound") return "sent";
  return parsed.isUnread ? "received" : "read";
}

function applyLabelState(existing, parsed) {
  let changed = false;
  const nextRead = !parsed.isUnread;
  if (existing.isRead !== nextRead) {
    existing.isRead = nextRead;
    existing.readAt = nextRead ? (existing.readAt || parsed.internalDate || new Date()) : undefined;
    if (existing.direction === "inbound") existing.status = nextRead ? "read" : "received";
    changed = true;
  }
  if (existing.isStarred !== parsed.isStarred) {
    existing.isStarred = parsed.isStarred;
    changed = true;
  }
  const labelStr = (parsed.labelIds || []).join(",");
  if ((existing.labelIds || []).join(",") !== labelStr) {
    existing.labelIds = parsed.labelIds;
    changed = true;
  }
  return changed;
}

async function upsertGmailMessage(integration, message) {
  const parsed = parseGmailMessage(message, { connectedEmail: integration.gmail?.email });
  if (!parsed.providerMessageId) return { skipped: true };
  const userId = integration.userId;

  const existing = await EmailMessage.findOne({
    userId,
    emailIntegrationId: integration._id,
    provider: "gmail",
    providerMessageId: parsed.providerMessageId
  });
  if (existing) {
    const changed = applyLabelState(existing, parsed);
    if (changed) await existing.save();
    return { imported: false, duplicate: true, updated: changed, threadId: existing.threadId, parsed };
  }

  const thread = await resolveThreadForGmail(integration, parsed);
  const isOutbound = parsed.direction === "outbound";

  let message_doc;
  try {
    message_doc = await EmailMessage.create({
      userId,
      emailIntegrationId: integration._id,
      threadId: thread._id,
      agentId: thread.agentId,
      leadId: thread.leadId,
      campaignId: thread.campaignId,
      direction: parsed.direction,
      fromEmail: parsed.fromEmail,
      toEmail: parsed.toEmail,
      from: parsed.from,
      to: parsed.to,
      cc: parsed.cc?.length ? parsed.cc : undefined,
      bcc: parsed.bcc?.length ? parsed.bcc : undefined,
      replyTo: parsed.replyTo?.length ? parsed.replyTo : undefined,
      subject: parsed.subject,
      body: parsed.textBody,
      text: parsed.textBody,
      textBody: parsed.textBody,
      html: parsed.htmlBody,
      htmlBody: parsed.htmlBody,
      provider: "gmail",
      providerMessageId: parsed.providerMessageId,
      providerThreadId: parsed.providerThreadId,
      internetMessageId: parsed.internetMessageId || undefined,
      inReplyTo: parsed.inReplyTo,
      references: parsed.references?.length ? parsed.references : undefined,
      labelIds: parsed.labelIds,
      snippet: parsed.snippet,
      gmailInternalDate: parsed.internalDate,
      headers: parsed.headers,
      attachments: parsed.attachments?.length ? parsed.attachments : undefined,
      hasAttachments: parsed.hasAttachments,
      receivedAt: isOutbound ? undefined : parsed.internalDate,
      sentAt: isOutbound ? parsed.internalDate : undefined,
      isRead: isOutbound ? true : !parsed.isUnread,
      readAt: isOutbound || !parsed.isUnread ? parsed.internalDate : undefined,
      isStarred: parsed.isStarred,
      isDraft: parsed.isDraft,
      status: messageStatusFor(parsed),
      rawPayload: undefined
    });
  } catch (error) {
    // Lost an idempotency race (unique index) — treat as duplicate.
    if (error?.code === 11000) return { imported: false, duplicate: true, threadId: thread._id, parsed };
    throw error;
  }

  // Keep the thread anchored to the Gmail thread id + refresh convenience fields.
  if (!thread.threadHeaders?.providerThreadId && parsed.providerThreadId) {
    thread.threadHeaders = { ...(thread.threadHeaders || {}), providerThreadId: parsed.providerThreadId };
  }
  thread.provider = "gmail";
  thread.emailIntegrationId = thread.emailIntegrationId || integration._id;
  thread.snippet = parsed.snippet || thread.snippet;
  thread.labelIds = Array.from(new Set([...(thread.labelIds || []), ...(parsed.labelIds || [])]));
  thread.hasAttachments = thread.hasAttachments || parsed.hasAttachments;
  thread.messagesCount = (thread.messagesCount || 0) + 1;
  if (parsed.internalDate && parsed.internalDate > (thread.lastMessageAt || 0)) {
    thread.lastMessageAt = parsed.internalDate;
  }
  if (!isOutbound) {
    thread.status = parsed.isUnread ? "needs_reply" : (thread.status === "needs_reply" ? "needs_reply" : thread.status);
  }
  thread.normalizedSubject = thread.normalizedSubject || normalizeEmailSubject(parsed.subject);
  thread.subject = thread.subject || parsed.subject;
  await thread.save();

  return { imported: true, threadId: thread._id, messageId: message_doc._id, parsed, isUnreadInbound: !isOutbound && parsed.isUnread };
}

async function emitUnread(integration) {
  const userId = integration.userId;
  const unreadCount = await EmailMessage.countDocuments({
    userId,
    direction: "inbound",
    isRead: false
  });
  emitToUser(userId, "email:unread-count", { unreadCount });
  return unreadCount;
}

// ---- Initial (full) sync -------------------------------------------------------------------
async function initialGmailSync(integration, gmail) {
  const maxMessages = intEnv("GMAIL_INITIAL_SYNC_MAX_MESSAGES", 500);
  const pageSize = intEnv("GMAIL_SYNC_PAGE_SIZE", 100);
  const concurrency = intEnv("EMAIL_SYNC_CONCURRENCY", 2);
  const stats = { mode: "full", fetchedCount: 0, importedCount: 0, duplicateCount: 0, updatedCount: 0 };

  let pageToken;
  let collected = 0;
  let nextPageToken = "";
  let newInbound = false;

  while (collected < maxMessages) {
    const remaining = maxMessages - collected;
    const { data } = await gmail.users.messages.list({
      userId: "me",
      q: initialQuery(),
      maxResults: Math.min(pageSize, remaining),
      pageToken: pageToken || undefined
    });
    const ids = (data.messages || []).map((m) => m.id);
    nextPageToken = data.nextPageToken || "";
    if (!ids.length) break;

    const messages = await mapWithConcurrency(ids, concurrency, (id) => fetchFullMessage(gmail, id));
    for (const message of messages) {
      if (!message) continue;
      const result = await upsertGmailMessage(integration, message);
      stats.fetchedCount += 1;
      if (result.imported) stats.importedCount += 1;
      if (result.duplicate) stats.duplicateCount += 1;
      if (result.updated) stats.updatedCount += 1;
      if (result.isUnreadInbound) newInbound = true;
    }
    collected += ids.length;
    pageToken = nextPageToken;
    if (!pageToken) break;
  }

  integration.gmail.gmailInitialSyncComplete = true;
  integration.gmail.gmailNextPageToken = nextPageToken || "";
  integration.gmail.gmailLastFullSyncAt = new Date();
  if (newInbound) emitToUser(integration.userId, "email:received", { source: "gmail_full_sync" });
  return stats;
}

// ---- Incremental sync via history.list -----------------------------------------------------
async function incrementalGmailSync(integration, gmail) {
  const startHistoryId = integration.gmail.gmailHistoryId;
  const concurrency = intEnv("EMAIL_SYNC_CONCURRENCY", 2);
  const stats = { mode: "partial", fetchedCount: 0, importedCount: 0, duplicateCount: 0, updatedCount: 0 };

  if (!startHistoryId) {
    // No cursor yet — fall back to a bounded recent list so we never miss mail.
    return initialGmailSync(integration, gmail);
  }

  const changedIds = new Set();
  const deletedIds = new Set();
  let pageToken;
  let latestHistoryId = startHistoryId;

  do {
    const { data } = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded", "labelAdded", "labelRemoved"],
      pageToken: pageToken || undefined
    });
    if (data.historyId) latestHistoryId = String(data.historyId);
    for (const history of data.history || []) {
      for (const added of history.messagesAdded || []) changedIds.add(added.message.id);
      for (const label of history.labelsAdded || []) changedIds.add(label.message.id);
      for (const label of history.labelsRemoved || []) changedIds.add(label.message.id);
      for (const deleted of history.messagesDeleted || []) deletedIds.add(deleted.message.id);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  // Deletions: drop the local copy so the app stays consistent with Gmail.
  for (const id of deletedIds) {
    changedIds.delete(id);
    await EmailMessage.deleteOne({
      userId: integration.userId,
      emailIntegrationId: integration._id,
      provider: "gmail",
      providerMessageId: id
    }).catch(() => {});
  }

  const ids = Array.from(changedIds);
  let newInbound = false;
  const messages = await mapWithConcurrency(ids, concurrency, (id) =>
    fetchFullMessage(gmail, id).catch((error) => (isGmailHistoryExpired(error) ? null : Promise.reject(error)))
  );
  for (const message of messages) {
    if (!message) continue;
    const result = await upsertGmailMessage(integration, message);
    stats.fetchedCount += 1;
    if (result.imported) stats.importedCount += 1;
    if (result.duplicate) stats.duplicateCount += 1;
    if (result.updated) stats.updatedCount += 1;
    if (result.isUnreadInbound) newInbound = true;
  }

  integration.gmail.gmailHistoryId = String(latestHistoryId);
  if (newInbound) emitToUser(integration.userId, "email:received", { source: "gmail_incremental_sync" });
  return stats;
}

// A history 404 means the cursor is too old. Reset and do a controlled recent sync, then adopt a
// fresh historyId from the profile.
async function recoverFromExpiredHistory(integration, gmail) {
  integration.gmail.gmailHistoryId = "";
  const stats = await initialGmailSync(integration, gmail);
  try {
    const { data } = await gmail.users.getProfile({ userId: "me" });
    if (data?.historyId) integration.gmail.gmailHistoryId = String(data.historyId);
  } catch { /* keep whatever we have */ }
  stats.mode = "full";
  stats.recovered = true;
  return stats;
}

export async function runGmailSync(integration) {
  if (!integration?.gmail?.connected || integration.gmail.syncEnabled === false) {
    return { success: false, importedCount: 0, duplicateCount: 0, error: "Gmail is not connected." };
  }
  const key = String(integration._id);
  if (activeSyncs.has(key)) {
    return { success: true, skipped: true, reason: "sync already running", importedCount: 0, duplicateCount: 0 };
  }
  activeSyncs.add(key);

  const userId = integration.userId;
  integration.gmail.syncStatus = "syncing";
  integration.gmail.lastError = "";
  integration.gmail.lastErrorType = "";
  await integration.save().catch(() => {});
  emitToUser(userId, "email:sync-status", { provider: "gmail", syncStatus: "syncing" });

  try {
    const { gmail } = createAuthorizedGmailClient(integration);
    let stats;
    if (!integration.gmail.gmailInitialSyncComplete) {
      stats = await initialGmailSync(integration, gmail);
    } else {
      try {
        stats = await incrementalGmailSync(integration, gmail);
      } catch (error) {
        if (isGmailHistoryExpired(error)) stats = await recoverFromExpiredHistory(integration, gmail);
        else throw error;
      }
    }

    integration.gmail.lastSyncedAt = new Date();
    integration.gmail.syncStatus = "idle";
    integration.gmail.lastError = "";
    integration.gmail.lastErrorType = "";
    await integration.save();

    const unreadCount = await emitUnread(integration);
    emitToUser(userId, "email:sync-status", { provider: "gmail", syncStatus: "idle", importedCount: stats.importedCount });
    return { success: true, ...stats, unreadCount, lastSyncedAt: integration.gmail.lastSyncedAt };
  } catch (error) {
    const type = await markGmailErrorState(integration, error);
    emitToUser(userId, "email:sync-status", { provider: "gmail", syncStatus: "error", errorType: type });
    return { success: false, importedCount: 0, duplicateCount: 0, error: integration.gmail.lastError, errorType: type };
  } finally {
    activeSyncs.delete(key);
  }
}

// ---- Load older mail (pagination) ----------------------------------------------------------
export async function importMoreGmailMessages(integration) {
  if (!integration?.gmail?.connected) {
    return { success: false, error: "Gmail is not connected.", importedCount: 0, duplicateCount: 0, hasMore: false };
  }
  const token = integration.gmail.gmailNextPageToken;
  if (!token) return { success: true, importedCount: 0, duplicateCount: 0, nextPageToken: "", hasMore: false };

  const key = String(integration._id);
  if (activeImports.has(key)) return { success: true, skipped: true, importedCount: 0, duplicateCount: 0, hasMore: true };
  activeImports.add(key);

  try {
    const { gmail } = createAuthorizedGmailClient(integration);
    const pageSize = intEnv("GMAIL_SYNC_PAGE_SIZE", 100);
    const concurrency = intEnv("EMAIL_SYNC_CONCURRENCY", 2);
    const { data } = await gmail.users.messages.list({
      userId: "me",
      q: initialQuery(),
      maxResults: pageSize,
      pageToken: token
    });
    const ids = (data.messages || []).map((m) => m.id);
    const nextPageToken = data.nextPageToken || "";

    let importedCount = 0;
    let duplicateCount = 0;
    const messages = await mapWithConcurrency(ids, concurrency, (id) => fetchFullMessage(gmail, id));
    for (const message of messages) {
      if (!message) continue;
      const result = await upsertGmailMessage(integration, message);
      if (result.imported) importedCount += 1;
      if (result.duplicate) duplicateCount += 1;
    }

    integration.gmail.gmailNextPageToken = nextPageToken;
    integration.gmail.lastSyncedAt = new Date();
    await integration.save();
    await emitUnread(integration);

    return { success: true, importedCount, duplicateCount, nextPageToken, hasMore: Boolean(nextPageToken) };
  } catch (error) {
    const type = await markGmailErrorState(integration, error);
    return { success: false, error: integration.gmail.lastError, errorType: type, importedCount: 0, duplicateCount: 0, hasMore: Boolean(integration.gmail.gmailNextPageToken) };
  } finally {
    activeImports.delete(key);
  }
}

// ---- Gmail-backed search -------------------------------------------------------------------
export async function searchGmailMessages(integration, query, { limit = 25 } = {}) {
  if (!integration?.gmail?.connected) {
    return { success: false, error: "Gmail is not connected.", threadIds: [] };
  }
  const q = String(query || "").trim().slice(0, 500);
  if (!q) return { success: true, threadIds: [], importedCount: 0 };

  const { gmail } = createAuthorizedGmailClient(integration);
  const concurrency = intEnv("EMAIL_SYNC_CONCURRENCY", 2);
  const { data } = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: Math.max(1, Math.min(Number(limit) || 25, 50))
  });
  const ids = (data.messages || []).map((m) => m.id);

  let importedCount = 0;
  const threadIds = new Set();
  const messages = await mapWithConcurrency(ids, concurrency, (id) => fetchFullMessage(gmail, id));
  for (const message of messages) {
    if (!message) continue;
    const result = await upsertGmailMessage(integration, message);
    if (result.imported) importedCount += 1;
    if (result.threadId) threadIds.add(String(result.threadId));
  }
  return { success: true, importedCount, threadIds: Array.from(threadIds) };
}

// Exposed for tests + reuse.
export { upsertGmailMessage, resolveThreadForGmail };
