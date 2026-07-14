import { GoogleGenAI } from "@google/genai";
import Agent from "../models/Agent.js";
import EmailCampaign from "../models/EmailCampaign.js";
import EmailCampaignRecipient from "../models/EmailCampaignRecipient.js";
import EmailLog from "../models/EmailLog.js";
import EmailMessage from "../models/EmailMessage.js";
import EmailThread from "../models/EmailThread.js";
import Lead from "../models/Lead.js";
import WebhookEvent from "../models/WebhookEvent.js";
import { listEmailProviders } from "../services/email/index.js";
import { findInboundEmailMatch, normalizeEmailSubject } from "../services/email/imapInboundPoller.js";
import { sendUserBrevoEmail } from "../services/brevoService.js";
import { emitToUser } from "../services/emailRealtime.service.js";
import { getOrCreateEmailIntegration } from "../services/emailIntegrationStatus.service.js";
import { syncEmailIntegration } from "../services/emailInboundSyncService.js";
import { sendGmailEmail, fetchGmailAttachment } from "../services/gmail/gmailSend.service.js";
import { storeSentGmailMessage } from "../services/gmail/gmailStore.service.js";
import { markGmailThreadRead } from "../services/gmail/gmailLabels.service.js";
import { searchGmailMessages } from "../services/gmail/gmailSync.service.js";
import { buildReplyRecipients, buildReplySubject, buildReplyThreadingHeaders } from "../services/gmail/gmailReply.util.js";
import { safeGmailErrorMessage } from "../services/gmail/gmailErrors.js";
import { createEmailSentFollowUp, pauseEmailSentFollowUpsForLead } from "../services/followUp.service.js";
import { chargeFeatureOrThrow } from "../services/billing/featureBilling.service.js";
import { creditEnforcementEnabled } from "../services/billing/featureAccess.service.js";
import ledger from "../services/billing/creditLedger.service.js";
import { getActionPricing } from "../config/creditPricing.js";
import { gmailDailyLimit } from "../config/gmailLimits.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const UNSUBSCRIBE_FOOTER = "\n\nIf this is not relevant, reply unsubscribe and I will not contact you again.";
const DAILY_LIMITS = { free: 25, starter: 100, pro: 500, agency: 2000 };
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const SEND_BATCH_SIZE = 10;
const SEND_BATCH_DELAY_MS = 2000;
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

function filter(req) {
  return ["admin", "super_admin"].includes(req.user.role) ? {} : { userId: req.user._id };
}

function clean(value) {
  return value ? String(value).trim() : "";
}

function normalizeEmail(value) {
  return clean(value).replace(/^.*<([^>]+)>.*$/, "$1").toLowerCase();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validEmail(value) {
  return EMAIL_REGEX.test(clean(value).toLowerCase());
}

function isUnsubscribed(lead) {
  return Boolean(lead.emailUnsubscribed || lead.unsubscribed || lead.customFields?.emailUnsubscribed);
}

async function ensureAgentAccess(req, agentId) {
  const agent = await Agent.findOne({ _id: agentId, ...filter(req) });
  if (!agent) throw new ApiError(404, "Agent not found or not accessible.");
  return agent;
}

function ensureFooter(body) {
  const text = clean(body);
  return text.toLowerCase().includes("reply unsubscribe") ? text : `${text}${UNSUBSCRIBE_FOOTER}`;
}

function leadName(lead) {
  return clean(lead.contactName || lead.name || lead.businessName || lead.email);
}

function senderEmail() {
  return clean(process.env.FROM_EMAIL || process.env.EMAIL_FROM || process.env.SMTP_FROM).toLowerCase();
}

function integrationSenderEmail(integration) {
  return clean(integration?.brevo?.senderEmail || "").toLowerCase();
}

function replyDomain() {
  const configured = clean(process.env.INBOUND_REPLY_DOMAIN || process.env.REPLY_DOMAIN);
  if (configured) return configured.replace(/^@/, "");
  const from = senderEmail();
  return from.includes("@") ? from.split("@").pop() : "yourdomain.com";
}

function replyToFor({ leadId, campaignId }) {
  const inbox = normalizeEmail(process.env.IMAP_USER || process.env.FROM_EMAIL);
  if (inbox) return inbox;
  if (!leadId || !campaignId) return senderEmail();
  return `reply+${leadId}+${campaignId}@${replyDomain()}`;
}

async function requireUserEmailIntegration(userId) {
  const integration = await getOrCreateEmailIntegration(userId);
  if (!integration?.brevo?.connected) {
    throw new ApiError(400, "Connect your Brevo account before sending emails.");
  }
  return integration;
}

// Gmail is the active provider. All new sends/replies/campaigns go through it.
async function requireGmailIntegration(userId) {
  const integration = await getOrCreateEmailIntegration(userId);
  if (!integration?.gmail?.connected || !integration.gmail.email) {
    throw new ApiError(400, "Connect Gmail before sending emails.");
  }
  return integration;
}

const MAX_RECIPIENTS = 100;
const MAX_SUBJECT_LENGTH = 255;

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Validates + normalizes a recipient list. Rejects header injection (CR/LF) and invalid addresses.
function assertRecipientList(value, label, { required = false } = {}) {
  const raw = Array.isArray(value) ? value : (value ? [value] : []);
  const list = raw
    .map((entry) => normalizeEmail(typeof entry === "string" ? entry : entry?.email || ""))
    .filter(Boolean);
  if (required && !list.length) throw new ApiError(400, `${label} requires at least one recipient.`);
  for (const address of list) {
    if (/[\r\n]/.test(address)) throw new ApiError(400, `${label} contains an invalid character.`);
    if (!validEmail(address)) throw new ApiError(400, `${address} is not a valid email address.`);
  }
  return Array.from(new Set(list));
}

function assertSubject(value) {
  const subject = clean(value);
  if (/[\r\n]/.test(subject)) throw new ApiError(400, "Subject cannot contain line breaks.");
  if (subject.length > MAX_SUBJECT_LENGTH) throw new ApiError(400, "Subject is too long.");
  return subject;
}

// Converts inbound compose attachments ({ filename, mimeType, contentBase64 }) into MailComposer
// parts, enforcing the configured total-size limit.
function buildOutgoingAttachments(value) {
  if (!Array.isArray(value) || !value.length) return [];
  const maxBytes = (Number(process.env.GMAIL_MAX_ATTACHMENT_MB) || 20) * 1024 * 1024;
  let total = 0;
  const attachments = value.slice(0, 20).map((att) => {
    const base64 = String(att?.contentBase64 || att?.content || "").replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    total += buffer.length;
    if (total > maxBytes) throw new ApiError(413, `Attachments exceed the ${maxBytes / (1024 * 1024)}MB limit.`);
    return {
      filename: clean(att?.filename) || "attachment",
      mimeType: clean(att?.mimeType) || "application/octet-stream",
      content: buffer
    };
  });
  return attachments;
}

function safeContentType(mimeType) {
  const value = clean(mimeType).toLowerCase();
  // Never serve active content types inline; force a neutral type so browsers don't execute them.
  if (!value || /html|javascript|xml|svg/.test(value)) return "application/octet-stream";
  return value.replace(/[^a-z0-9!#$&^_.+/-]/g, "") || "application/octet-stream";
}

function sanitizeFilename(name) {
  return clean(name).replace(/[\r\n"\\/]/g, "_").replace(/[^\w.\- ]/g, "").slice(0, 200) || "attachment";
}

function gmailSender(integration) {
  return clean(integration?.gmail?.email || "").toLowerCase();
}

const GMAIL_FOLDER_LABELS = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFT",
  starred: "STARRED",
  important: "IMPORTANT",
  spam: "SPAM",
  trash: "TRASH"
};

// Attaches lastMessage/preview/unread/message counts to a set of lean thread docs.
async function decorateThreads(req, threads) {
  const threadIds = threads.map((thread) => thread._id);
  if (!threadIds.length) return [];
  const messages = await EmailMessage.find({ threadId: { $in: threadIds }, ...filter(req) })
    .sort({ createdAt: -1 })
    .lean();
  const latestByThread = {};
  const statsByThread = {};
  for (const message of messages) {
    const key = String(message.threadId);
    if (!latestByThread[key]) latestByThread[key] = message;
    statsByThread[key] = statsByThread[key] || { messagesCount: 0, unreadCount: 0 };
    statsByThread[key].messagesCount += 1;
    if (message.direction === "inbound" && !message.isRead && !message.readAt) statsByThread[key].unreadCount += 1;
  }
  return threads.map((thread) => ({
    ...thread,
    leadName: thread.leadId?.businessName || thread.leadId?.contactName || thread.leadId?.name || "",
    email: thread.leadId?.email || thread.toEmail || thread.fromEmail || "",
    lastMessage: latestByThread[String(thread._id)] || null,
    lastMessagePreview: previewBody(latestByThread[String(thread._id)] || {}),
    unreadCount: statsByThread[String(thread._id)]?.unreadCount || 0,
    messagesCount: statsByThread[String(thread._id)]?.messagesCount || thread.messagesCount || 0
  }));
}

function canonicalSubject(subject = "") {
  return clean(subject)
    .replace(/^\s*(re|fw|fwd)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function previewBody(message) {
  return clean(message.textBody || message.body || String(message.htmlBody || "").replace(/<[^>]+>/g, " ")).slice(0, 240);
}

function unreadInboundQuery(req, extra = {}) {
  return {
    ...filter(req),
    direction: "inbound",
    status: "received",
    $or: [{ readAt: { $exists: false } }, { readAt: null }],
    ...extra
  };
}

function looksPositive(text = "") {
  const value = text.toLowerCase();
  return /\b(interested|yes|sure|sounds good|tell me more|book|schedule|demo|call me|let'?s talk|available|send details)\b/.test(value);
}

function looksNegative(text = "") {
  const value = text.toLowerCase();
  return /\b(unsubscribe|not interested|remove me|stop emailing|do not contact|don'?t contact|no thanks|not relevant)\b/.test(value);
}

function extractAddress(value) {
  if (Array.isArray(value)) return normalizeEmail(value[0]?.email || value[0]?.address || value[0]);
  if (value && typeof value === "object") return normalizeEmail(value.email || value.address || value.mail);
  return normalizeEmail(value);
}

function extractBrevoInbound(payload = {}) {
  const rawTo = payload.to || payload.recipient || payload.recipients || payload.To || payload.Recipient;
  const firstTo = Array.isArray(rawTo) ? rawTo[0] : rawTo;
  const textBody = clean(payload.textBody || payload.text || payload.TextBody || payload["body-plain"] || payload.body_plain);
  const htmlBody = clean(payload.htmlBody || payload.html || payload.HtmlBody || payload["body-html"] || payload.body_html);

  return {
    fromEmail: extractAddress(payload.from || payload.sender || payload.From || payload.Sender || payload.email),
    toEmail: extractAddress(firstTo || payload.toEmail || payload.ToEmail),
    subject: clean(payload.subject || payload.Subject),
    textBody,
    htmlBody,
    messageId: clean(payload.messageId || payload.message_id || payload["message-id"] || payload.MessageId || payload.uuid),
    providerThreadId: clean(payload.threadId || payload.thread_id || payload.conversationId || payload.conversation_id),
    receivedAt: payload.receivedAt || payload.date || payload.Date || payload.timestamp || new Date()
  };
}

function parseTrackableReplyAddress(toEmail = "") {
  const match = normalizeEmail(toEmail).match(/^reply\+([a-f\d]{24})\+([a-f\d]{24})@/i);
  if (!match) return {};
  return { leadId: match[1], campaignId: match[2] };
}

async function findOrCreateThread({ userId, agentId, leadId, campaignId, subject, fromEmail, toEmail, status = "open", lastMessageAt = new Date() }) {
  const normalizedSubject = normalizeEmailSubject(subject);
  const replyToEmail = normalizeEmail(process.env.IMAP_USER || process.env.FROM_EMAIL);
  const lookup = { userId };
  if (leadId) lookup.leadId = leadId;
  if (campaignId) lookup.campaignId = campaignId;

  let thread = leadId && campaignId ? await EmailThread.findOne(lookup) : null;
  if (!thread && !leadId && !campaignId && toEmail) {
    thread = await EmailThread.findOne({
      userId,
      toEmail: normalizeEmail(toEmail),
      $and: [
        { $or: [{ leadId: { $exists: false } }, { leadId: null }] },
        { $or: [{ campaignId: { $exists: false } }, { campaignId: null }] },
        {
          $or: [
            { normalizedSubject },
            { subject: { $regex: `^${canonicalSubject(subject).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }
          ]
        }
      ]
    });
  }
  if (!thread && leadId) {
    thread = await EmailThread.findOne({
      userId,
      leadId,
      $or: [
        { normalizedSubject },
        { subject: { $regex: `^${canonicalSubject(subject).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }
      ]
    });
  }
  if (!thread) {
    thread = await EmailThread.create({
      userId,
      agentId,
      leadId,
      campaignId,
      subject,
      normalizedSubject,
      fromEmail,
      toEmail,
      replyToEmail,
      status,
      lastMessageAt
    });
  } else {
    thread.agentId = thread.agentId || agentId;
    thread.leadId = thread.leadId || leadId;
    thread.campaignId = thread.campaignId || campaignId;
    thread.subject = thread.subject || subject;
    thread.normalizedSubject = thread.normalizedSubject || normalizedSubject;
    thread.fromEmail = thread.fromEmail || fromEmail;
    thread.toEmail = thread.toEmail || toEmail;
    thread.replyToEmail = thread.replyToEmail || replyToEmail;
    thread.status = status || thread.status;
    thread.lastMessageAt = lastMessageAt;
    await thread.save();
  }
  return thread;
}

async function saveOutboundEmailMessage({
  userId,
  emailIntegrationId,
  agentId,
  leadId,
  campaignId,
  subject,
  body,
  toEmail,
  toName,
  providerKey,
  providerMessageId,
  sentAt = new Date(),
  rawPayload = {}
}) {
  const fromEmail = normalizeEmail(rawPayload.fromEmail) || senderEmail();
  const replyToEmail = normalizeEmail(rawPayload.replyTo || process.env.IMAP_USER || process.env.FROM_EMAIL);
  const thread = await findOrCreateThread({
    userId,
    agentId,
    leadId,
    campaignId,
    subject,
    fromEmail,
    toEmail,
    status: "open",
    lastMessageAt: sentAt
  });

  const message = await EmailMessage.create({
      userId,
      emailIntegrationId,
      threadId: thread._id,
    agentId,
    leadId,
    campaignId,
    direction: "outbound",
      fromEmail,
      toEmail,
      from: [{ email: fromEmail }],
      to: [{ email: toEmail, name: toName }],
      subject,
      body,
      text: body,
      html: `<html><body>${String(body || "").replace(/\n/g, "<br>")}</body></html>`,
      textBody: body,
      htmlBody: `<html><body>${String(body || "").replace(/\n/g, "<br>")}</body></html>`,
      provider: providerKey,
      providerMessageId,
      internetMessageId: rawPayload.internetMessageId || providerMessageId || "",
      sentAt,
      isRead: true,
      status: "sent",
    rawPayload: { ...rawPayload, toName }
  });

  thread.status = "open";
  thread.lastMessageAt = sentAt;
  thread.fromEmail = thread.fromEmail || fromEmail;
  thread.toEmail = thread.toEmail || toEmail;
  thread.normalizedSubject = thread.normalizedSubject || normalizeEmailSubject(subject);
  thread.replyToEmail = thread.replyToEmail || replyToEmail;
  await thread.save();

  console.info("[email] outbound message saved", {
    campaignId: campaignId ? String(campaignId) : null,
    leadId: leadId ? String(leadId) : null,
    toEmail,
    threadId: String(thread._id),
    messageId: String(message._id),
    providerMessageId
  });

  return { thread, message };
}

async function resolveInboundThread({ fromEmail, toEmail, subject }) {
  const tracked = parseTrackableReplyAddress(toEmail);
  let lead = null;
  let campaign = null;
  let thread = null;

  if (tracked.leadId && tracked.campaignId) {
    [lead, campaign] = await Promise.all([
      Lead.findById(tracked.leadId),
      EmailCampaign.findById(tracked.campaignId)
    ]);
    if (lead) {
      thread = await EmailThread.findOne({ leadId: lead._id, campaignId: campaign?._id || tracked.campaignId });
    }
  }

  if (!lead && fromEmail) {
    lead = await Lead.findOne({ email: normalizeEmail(fromEmail) }).sort({ updatedAt: -1 });
  }

  if (!thread && lead) {
    const query = { userId: lead.userId, leadId: lead._id };
    if (campaign?._id) query.campaignId = campaign._id;
    thread = await EmailThread.findOne(query).sort({ lastMessageAt: -1 });
  }

  if (!thread && subject) {
    const canonical = canonicalSubject(subject);
    const candidates = await EmailThread.find({}).sort({ lastMessageAt: -1 }).limit(200);
    thread = candidates.find((item) => canonicalSubject(item.subject) === canonical) || null;
    if (thread && !lead && thread.leadId) lead = await Lead.findById(thread.leadId);
    if (thread && !campaign && thread.campaignId) campaign = await EmailCampaign.findById(thread.campaignId);
  }

  if (!campaign && thread?.campaignId) campaign = await EmailCampaign.findById(thread.campaignId);
  if (!lead && thread?.leadId) lead = await Lead.findById(thread.leadId);

  return { tracked, lead, campaign, thread };
}

function personalize(text, { lead, agent }) {
  const replacements = {
    "{{businessName}}": clean(lead.businessName || lead.name || "your business"),
    "{{contactName}}": clean(lead.contactName || lead.name || "there"),
    "{{city}}": clean(lead.city || "your city"),
    "{{phone}}": clean(lead.phone),
    "{{website}}": clean(lead.website),
    "{{agentName}}": clean(agent.agentName || "our AI assistant"),
    "{{businessNameOfUser}}": clean(agent.businessName || "our team")
  };

  return Object.entries(replacements).reduce(
    (result, [placeholder, value]) => result.replaceAll(placeholder, value),
    text || ""
  );
}

async function selectedLeads(req, leadIds) {
  if (!Array.isArray(leadIds) || !leadIds.length) return [];
  return Lead.find({ _id: { $in: leadIds }, ...filter(req) }).sort({ createdAt: -1 });
}

// Pre-flight check at enqueue time. Blocks only when the account has ALREADY exhausted today's
// Gmail cap — a large campaign can still be queued and the worker paces it across days.
async function checkDailyLimit(req) {
  const limit = gmailDailyLimit(req.user.plan);
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const sentToday = await EmailLog.countDocuments({
    userId: req.user._id,
    provider: "gmail",
    status: "sent",
    sentAt: { $gte: since }
  });

  if (sentToday >= limit) {
    throw new ApiError(429, `Daily Gmail sending limit reached for the ${req.user.plan || "free"} plan. Sending resumes tomorrow.`);
  }
}

function parseGeneratedEmail(text) {
  const cleaned = clean(text).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      subject: clean(parsed.subject),
      body: clean(parsed.body)
    };
  } catch {
    const subjectMatch = cleaned.match(/subject\s*:\s*(.+)/i);
    return {
      subject: clean(subjectMatch?.[1] || "Quick idea for {{businessName}}"),
      body: clean(cleaned.replace(subjectMatch?.[0] || "", "")) || "Hi {{contactName}},\n\nI wanted to share a quick idea for {{businessName}} in {{city}}."
    };
  }
}

function fallbackGeneratedEmail({ offer }) {
  return {
    subject: "Quick idea for {{businessName}}",
    body: ensureFooter(`Hi {{contactName}},

I noticed {{businessName}} in {{city}} and thought this could be useful.

${offer ? `We are currently offering ${offer}.` : `We help businesses respond faster, qualify leads, and follow up automatically.`}

Would you be open to a quick call with {{agentName}} from {{businessNameOfUser}}?`)
  };
}

async function generateEmailWithGemini({ agent, goal, offer, tone, sampleLeads }) {
  if (!process.env.GEMINI_API_KEY) {
    return fallbackGeneratedEmail({ offer });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const prompt = `
Create a short outbound email campaign for saved business leads.

Agent:
- Agent name: ${agent.agentName || ""}
- User business name: ${agent.businessName || ""}
- Business category: ${agent.businessCategory || ""}
- Services: ${agent.services || ""}

Campaign:
- Goal: ${goal || "Book a discovery call"}
- Offer: ${offer || "Not provided"}
- Tone: ${tone || "Professional"}
- Sample leads: ${sampleLeads.map((lead) => lead.businessName || lead.name || lead.email).join(", ")}

Return ONLY valid JSON:
{
  "subject": "",
  "body": ""
}

Rules:
- Keep the subject under 70 characters.
- Keep the body under 160 words.
- Use these placeholders naturally: {{businessName}}, {{contactName}}, {{city}}, {{agentName}}, {{businessNameOfUser}}.
- Do not invent specific claims, prices, awards, or partnerships.
- Do not include markdown.
- Do not include the unsubscribe footer; the system adds it.
`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.5,
        responseMimeType: "application/json"
      }
    });

    const generated = parseGeneratedEmail(response.text);
    return { ...generated, body: ensureFooter(generated.body) };
  } catch (error) {
    console.error("Email generation Gemini fallback used:", error.status || error.code, error.message);
    return {
      ...fallbackGeneratedEmail({ offer }),
      warning: "AI generation is temporarily unavailable, so a safe email template was used."
    };
  }
}

export const listCampaigns = asyncHandler(async (req, res) => {
  const campaigns = await EmailCampaign.find(filter(req))
    .populate("agentId", "agentName businessName")
    .sort({ createdAt: -1 })
    .limit(50);
  res.json(campaigns);
});

export const createCampaign = asyncHandler(async (req, res) => {
  const { agentId, name, subject = "", body = "", selectedLeadIds = [] } = req.body;
  await ensureAgentAccess(req, agentId);
  const leads = await selectedLeads(req, selectedLeadIds);
  const seenEmails = new Set();
  const validLeadIds = leads
    .filter((lead) => {
      const email = clean(lead.email).toLowerCase();
      if (!validEmail(email) || isUnsubscribed(lead) || seenEmails.has(email)) return false;
      seenEmails.add(email);
      return true;
    })
    .map((lead) => lead._id);

  const campaign = await EmailCampaign.create({
    userId: req.user._id,
    agentId,
    name: clean(name) || "Email Campaign",
    subject,
    body: ensureFooter(body),
    selectedLeadIds: validLeadIds,
    status: "draft",
    totalRecipients: validLeadIds.length
  });

  res.status(201).json(campaign);
});

export const listLogs = asyncHandler(async (req, res) => {
  const logs = await EmailLog.find(filter(req))
    .populate("campaignId", "name")
    .populate("leadId", "businessName name")
    .sort({ createdAt: -1 })
    .limit(100);
  res.json(logs);
});

export const listProviders = asyncHandler(async (req, res) => {
  res.json(listEmailProviders());
});

export const getUnreadEmailCount = asyncHandler(async (req, res) => {
  const count = await EmailMessage.countDocuments(unreadInboundQuery(req));
  res.json({ count });
});

// Per-folder thread counts for the inbox sidebar (distinct threads per Gmail label).
export const getFolderCounts = asyncHandler(async (req, res) => {
  const base = filter(req);
  const perLabel = await EmailMessage.aggregate([
    { $match: { ...base, provider: "gmail" } },
    { $unwind: "$labelIds" },
    { $group: { _id: { label: "$labelIds", thread: "$threadId" } } },
    { $group: { _id: "$_id.label", count: { $sum: 1 } } }
  ]);
  const byLabel = perLabel.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {});
  const unreadThreads = await EmailMessage.distinct("threadId", {
    ...base,
    provider: "gmail",
    direction: "inbound",
    isRead: false
  });
  const all = await EmailThread.countDocuments({ ...base });

  res.json({
    inbox: byLabel.INBOX || 0,
    unread: unreadThreads.length,
    sent: byLabel.SENT || 0,
    drafts: byLabel.DRAFT || 0,
    starred: byLabel.STARRED || 0,
    important: byLabel.IMPORTANT || 0,
    spam: byLabel.SPAM || 0,
    trash: byLabel.TRASH || 0,
    all
  });
});

export const generateEmail = asyncHandler(async (req, res) => {
  const { agentId, goal = "", offer = "", tone = "Professional", selectedLeadIds = [] } = req.body;
  const agent = await ensureAgentAccess(req, agentId);
  const leads = await selectedLeads(req, selectedLeadIds);
  const generated = await generateEmailWithGemini({ agent, goal, offer, tone, sampleLeads: leads.slice(0, 5) });
  res.json(generated);
});

export const sendTestEmail = asyncHandler(async (req, res) => {
  const { agentId, testEmail, subject, body } = req.body;
  const agent = await ensureAgentAccess(req, agentId);
  const toEmail = normalizeEmail(testEmail || req.user.email);
  if (!toEmail || !validEmail(toEmail)) throw new ApiError(400, "A valid test email address is required.");

  const integration = await requireGmailIntegration(req.user._id);
  const fakeLead = {
    businessName: "Sample Business",
    contactName: req.user.name,
    name: req.user.name,
    email: toEmail,
    city: "Sample City"
  };

  const finalSubject = assertSubject(personalize(subject, { lead: fakeLead, agent }) || "Test email");
  const finalBody = personalize(ensureFooter(body), { lead: fakeLead, agent });

  try {
    const sendResult = await sendGmailEmail(integration, {
      to: [{ email: toEmail, name: req.user.name }],
      subject: finalSubject,
      text: finalBody
    });

    const { thread, message } = await storeSentGmailMessage({
      integration,
      agentId: agent._id,
      toEmail,
      toName: req.user.name,
      subject: finalSubject,
      text: finalBody,
      sendResult,
      source: "test_email"
    });

    console.info("[email] gmail test send saved", {
      toEmail,
      threadId: String(thread._id),
      messageId: String(message._id),
      providerMessageId: sendResult.id
    });

    res.json({
      success: true,
      provider: "gmail",
      simulated: false,
      messageId: sendResult.id,
      threadId: thread._id,
      toEmail
    });
  } catch (error) {
    throw new ApiError(error.statusCode || 502, safeGmailErrorMessage(error, "Test email failed."));
  }
});

// Compose and send a brand-new email from the connected Gmail address.
export const sendEmail = asyncHandler(async (req, res) => {
  const integration = await requireGmailIntegration(req.user._id);
  const to = assertRecipientList(req.body.to, "To", { required: true });
  const cc = assertRecipientList(req.body.cc, "Cc");
  const bcc = assertRecipientList(req.body.bcc, "Bcc");
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
    throw new ApiError(400, `A single email cannot exceed ${MAX_RECIPIENTS} recipients.`);
  }
  const subject = assertSubject(req.body.subject);
  const text = clean(req.body.text || req.body.body);
  const html = typeof req.body.html === "string" ? req.body.html : "";
  if (!text && !html) throw new ApiError(400, "Email body is required.");
  const attachments = buildOutgoingAttachments(req.body.attachments);

  await chargeFeatureOrThrow({
    userId: req.user._id,
    featureKey: "email_send",
    idempotencyKey: `email_send:${req.user._id}:${Date.now()}`,
    metadata: { type: "compose" }
  });

  try {
    const sendResult = await sendGmailEmail(integration, {
      to: to.map((email) => ({ email })),
      cc: cc.map((email) => ({ email })),
      bcc: bcc.map((email) => ({ email })),
      subject,
      text,
      html,
      attachments
    });

    const { thread, message } = await storeSentGmailMessage({
      integration,
      toEmail: to[0],
      cc,
      bcc,
      subject,
      text,
      html,
      sendResult,
      source: "compose"
    });

    res.status(201).json({
      success: true,
      provider: "gmail",
      messageId: sendResult.id,
      threadId: thread._id,
      thread,
      message
    });
  } catch (error) {
    throw new ApiError(error.statusCode || 502, safeGmailErrorMessage(error, "The email could not be sent."));
  }
});

// Enqueue a Gmail campaign. Sending happens in the background worker — this endpoint validates,
// charges credits idempotently, queues one personalized recipient row per lead, and returns 202.
export const sendCampaign = asyncHandler(async (req, res) => {
  const campaign = await EmailCampaign.findOne({ _id: req.params.id, ...filter(req) });
  if (!campaign) throw new ApiError(404, "Email campaign not found.");

  const agent = await ensureAgentAccess(req, campaign.agentId);
  const leads = await Lead.find({ _id: { $in: campaign.selectedLeadIds }, ...filter(req) });
  const integration = await requireGmailIntegration(req.user._id);
  const connectedEmail = gmailSender(integration);

  const uniqueByEmail = new Map();
  const skipped = [];
  leads.forEach((lead) => {
    const email = clean(lead.email).toLowerCase();
    if (!email) return skipped.push({ lead, toEmail: "", error: "Missing email address." });
    if (!validEmail(email)) return skipped.push({ lead, toEmail: email, error: "Invalid email address." });
    if (isUnsubscribed(lead)) return skipped.push({ lead, toEmail: email, error: "Lead is unsubscribed." });
    if (email === connectedEmail) return skipped.push({ lead, toEmail: email, error: "Cannot send a campaign to your own address." });
    if (uniqueByEmail.has(email)) return skipped.push({ lead, toEmail: email, error: "Duplicate email in this campaign." });
    uniqueByEmail.set(email, lead);
  });

  const recipients = Array.from(uniqueByEmail.values());
  if (!recipients.length) throw new ApiError(400, "No valid recipients to queue for this campaign.");
  await checkDailyLimit(req);

  // Charge upfront, idempotent per campaign id — a retried enqueue never double-charges.
  if (creditEnforcementEnabled()) {
    const { cost } = getActionPricing("email_send");
    const totalCost = cost * recipients.length;
    const bill = await ledger.charge({
      userId: req.user._id,
      amount: totalCost,
      action: "email_send",
      mode: "platform_credits",
      idempotencyKey: `email_campaign:${campaign._id}`,
      metadata: { campaignId: campaign._id.toString(), count: recipients.length }
    });
    if (!bill.ok) {
      throw new ApiError(402, `Not enough credits to send to ${recipients.length} recipients (need ${totalCost} credits).`, { code: "INSUFFICIENT_CREDITS" });
    }
    if (!bill.reused) {
      await ledger.recordUsage({
        userId: req.user._id,
        action: "email_send",
        mode: "platform_credits",
        success: true,
        cost: totalCost,
        creditsCharged: totalCost,
        metadata: { campaignId: campaign._id.toString(), count: recipients.length }
      });
    }
  }

  // Log skipped recipients once (idempotent-ish: only when the campaign wasn't already queued).
  if (campaign.status !== "queued" && campaign.status !== "sending") {
    for (const item of skipped) {
      await EmailLog.create({
        userId: req.user._id,
        campaignId: campaign._id,
        leadId: item.lead?._id,
        toEmail: item.toEmail || item.lead?.email || "missing",
        subject: campaign.subject,
        body: ensureFooter(campaign.body),
        provider: "gmail",
        status: "skipped",
        error: item.error,
        sentAt: new Date()
      });
    }
  }

  // Queue one personalized row per recipient. Unique index (campaignId, toEmail) makes this idempotent.
  let queuedCount = 0;
  for (const lead of recipients) {
    const toEmail = clean(lead.email).toLowerCase();
    try {
      await EmailCampaignRecipient.create({
        userId: req.user._id,
        campaignId: campaign._id,
        leadId: lead._id,
        emailIntegrationId: integration._id,
        agentId: campaign.agentId,
        toEmail,
        toName: leadName(lead),
        personalizedSubject: personalize(campaign.subject, { lead, agent }),
        personalizedBody: personalize(ensureFooter(campaign.body), { lead, agent }),
        status: "queued",
        provider: "gmail",
        nextAttemptAt: new Date()
      });
      queuedCount += 1;
    } catch (error) {
      if (error?.code === 11000) continue; // already queued in a prior attempt
      throw error;
    }
  }

  // Resume recipients that were paused earlier (e.g. after a temporary Gmail disconnect).
  const resumed = await EmailCampaignRecipient.updateMany(
    { campaignId: campaign._id, status: "paused" },
    { $set: { status: "queued", nextAttemptAt: new Date(), error: "", lockedAt: null, lockedBy: "" } }
  );
  queuedCount += resumed.modifiedCount || 0;

  const skippedCount = skipped.length + Math.max(0, campaign.selectedLeadIds.length - leads.length);
  campaign.status = "queued";
  campaign.provider = "gmail";
  campaign.totalRecipients = recipients.length;
  campaign.queuedCount = queuedCount;
  campaign.skippedCount = skippedCount;
  campaign.sentCount = 0;
  campaign.failedCount = 0;
  campaign.queuedAt = new Date();
  campaign.lastError = "";
  await campaign.save();

  emitToUser(req.user._id, "email:campaign-status", { campaignId: campaign._id, status: campaign.status, queuedCount });

  res.status(202).json({
    success: true,
    status: campaign.status,
    campaign,
    queuedCount,
    skippedCount,
    totalRecipients: recipients.length
  });
});

// Live campaign status for frontend polling (recipient-status breakdown).
export const getCampaignStatus = asyncHandler(async (req, res) => {
  const campaign = await EmailCampaign.findOne({ _id: req.params.id, ...filter(req) });
  if (!campaign) throw new ApiError(404, "Email campaign not found.");
  const counts = await EmailCampaignRecipient.aggregate([
    { $match: { campaignId: campaign._id } },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  const breakdown = counts.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {});
  const pending = (breakdown.queued || 0) + (breakdown.processing || 0);
  res.json({ campaign, breakdown, pending });
});

export const listThreads = asyncHandler(async (req, res) => {
  const base = filter(req);
  const folder = clean(req.query.folder).toLowerCase();
  const search = clean(req.query.search);
  const status = clean(req.query.status);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

  const query = { ...base };

  // Folder filtering is driven by the accurate per-message Gmail labels.
  if (folder && folder !== "all") {
    const messageQuery = { ...base, provider: "gmail" };
    if (folder === "unread") {
      messageQuery.direction = "inbound";
      messageQuery.isRead = false;
    } else if (GMAIL_FOLDER_LABELS[folder]) {
      messageQuery.labelIds = GMAIL_FOLDER_LABELS[folder];
    }
    const threadIds = await EmailMessage.distinct("threadId", messageQuery);
    query._id = { $in: threadIds };
  } else if (status && status !== "all") {
    // Legacy status filter (kept for non-folder callers).
    if (status === "unread") query.status = { $in: ["unread", "needs_reply"] };
    else query.status = status;
  }

  if (req.query.leadId && OBJECT_ID_REGEX.test(req.query.leadId)) query.leadId = req.query.leadId;

  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    query.$or = [
      { subject: rx },
      { normalizedSubject: rx },
      { fromEmail: rx },
      { toEmail: rx },
      { snippet: rx }
    ];
  }

  const totalCount = await EmailThread.countDocuments(query);
  const threads = await EmailThread.find(query)
    .populate("leadId", "businessName contactName name email phone status city")
    .populate("campaignId", "name subject")
    .populate("agentId", "agentName businessName")
    .sort({ lastMessageAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const decorated = await decorateThreads(req, threads);
  res.json({
    threads: decorated,
    page,
    limit,
    totalCount,
    hasMore: page * limit < totalCount
  });
});

export const getThread = asyncHandler(async (req, res) => {
  const thread = await EmailThread.findOne({ _id: req.params.id, ...filter(req) })
    .populate("leadId", "businessName contactName name email phone status city website requirement")
    .populate("campaignId", "name subject")
    .populate("agentId", "agentName businessName businessCategory services");
  if (!thread) throw new ApiError(404, "Email thread not found.");

  const messages = await EmailMessage.find({ threadId: thread._id, ...filter(req) }).sort({ createdAt: 1 });
  res.json({ thread, messages });
});

export const getThreadMessages = asyncHandler(async (req, res) => {
  const thread = await EmailThread.findOne({ _id: req.params.id, ...filter(req) });
  if (!thread) throw new ApiError(404, "Email thread not found.");

  const messages = await EmailMessage.find({ threadId: thread._id, ...filter(req) }).sort({ createdAt: 1 });
  res.json(messages);
});

export const markThreadRead = asyncHandler(async (req, res) => {
  const thread = await EmailThread.findOne({ _id: req.params.id, ...filter(req) });
  if (!thread) throw new ApiError(404, "Email thread not found.");

  const now = new Date();
  const result = await EmailMessage.updateMany(
    unreadInboundQuery(req, { threadId: thread._id }),
    { $set: { readAt: now, status: "read", isRead: true } }
  );

  // Mirror the read state to Gmail (remove UNREAD from the whole conversation). Best-effort so a
  // Gmail hiccup never blocks the local update.
  const gmailThreadId = thread.threadHeaders?.providerThreadId;
  if (gmailThreadId) {
    const integration = await getOrCreateEmailIntegration(thread.userId);
    if (integration.gmail?.connected) {
      markGmailThreadRead(integration, gmailThreadId).catch((error) => {
        console.warn("[gmail] mark thread read failed", { message: error?.message });
      });
    }
  }

  const unreadCount = await EmailMessage.countDocuments(unreadInboundQuery(req));
  emitToUser(req.user._id, "email:read", { threadId: thread._id, markedCount: result.modifiedCount || 0, unreadCount });
  emitToUser(req.user._id, "email:unread-count", { unreadCount });

  res.json({
    success: true,
    markedCount: result.modifiedCount || 0,
    readAt: now,
    unreadCount
  });
});

export const simulateInboundReply = asyncHandler(async (req, res) => {
  const { fromEmail, body } = req.body;
  const normalizedFromEmail = normalizeEmail(fromEmail);
  const textBody = clean(body);

  if (!validEmail(normalizedFromEmail)) throw new ApiError(400, "A valid from email is required.");
  if (!textBody) throw new ApiError(400, "Message body is required.");

  const thread = await EmailThread.findOne({ _id: req.params.id, ...filter(req) });
  if (!thread) throw new ApiError(404, "Email thread not found.");

  const receivedAt = new Date();
  const message = await EmailMessage.create({
    userId: req.user._id,
    threadId: thread._id,
    agentId: thread.agentId,
    leadId: thread.leadId,
    campaignId: thread.campaignId,
    direction: "inbound",
    from: [{ email: normalizedFromEmail }],
    to: [{ email: thread.toEmail || senderEmail() }],
    fromEmail: normalizedFromEmail,
    toEmail: thread.toEmail || senderEmail(),
    subject: thread.subject,
    body: textBody,
    textBody,
    text: textBody,
    htmlBody: "",
    html: "",
    provider: "simulated",
    receivedAt,
    status: "received",
    isRead: false,
    rawPayload: {
      source: "simulate_inbound_reply",
      createdByUserId: req.user._id
    }
  });

  thread.status = "needs_reply";
  thread.lastMessageAt = receivedAt;
  thread.normalizedSubject = thread.normalizedSubject || normalizeEmailSubject(thread.subject || "");
  await thread.save();
  const unreadCount = await EmailMessage.countDocuments(unreadInboundQuery(req));
  emitToUser(req.user._id, "email:received", { threadId: thread._id, messageId: message._id, receivedAt, unreadCount });
  emitToUser(req.user._id, "email:unread-count", { unreadCount });

  console.info("[email] simulated inbound message saved", {
    campaignId: thread.campaignId ? String(thread.campaignId) : null,
    leadId: thread.leadId ? String(thread.leadId) : null,
    fromEmail: normalizedFromEmail,
    threadId: String(thread._id),
    messageId: String(message._id)
  });

  res.status(201).json({ success: true, thread, message });
});

export const pollInboundNow = asyncHandler(async (req, res) => {
  const integration = await getOrCreateEmailIntegration(req.user._id);
  if (!integration.inbound?.connected) {
    throw new ApiError(400, "Connect a receiving mailbox before syncing replies.");
  }
  const result = await syncEmailIntegration(integration);
  res.json(result);
});

export const testInboundMatch = asyncHandler(async (req, res) => {
  const fromEmail = normalizeEmail(req.body.fromEmail);
  const subject = clean(req.body.subject);
  if (!validEmail(fromEmail)) throw new ApiError(400, "A valid fromEmail is required.");
  if (!subject) throw new ApiError(400, "Subject is required.");

  const result = await findInboundEmailMatch({
    fromEmail,
    subject,
    userId: ["admin", "super_admin"].includes(req.user.role) ? undefined : req.user._id
  });

  res.json({
    matchedThread: result.matchedThread ? {
      _id: result.matchedThread._id,
      subject: result.matchedThread.subject,
      normalizedSubject: result.matchedThread.normalizedSubject || normalizeEmailSubject(result.matchedThread.subject),
      toEmail: result.matchedThread.toEmail,
      leadId: result.matchedThread.leadId?._id || result.matchedThread.leadId || null,
      status: result.matchedThread.status
    } : null,
    matchedLead: result.matchedLead ? {
      _id: result.matchedLead._id,
      email: result.matchedLead.email,
      name: result.matchedLead.businessName || result.matchedLead.contactName || result.matchedLead.name || ""
    } : null,
    reason: result.reason
  });
});

export const inboundBrevo = asyncHandler(async (req, res) => {
  await WebhookEvent.create({ provider: "brevo", eventType: "email_inbound", payload: req.body });
  const inbound = extractBrevoInbound(req.body);
  const { fromEmail, toEmail, subject, textBody, htmlBody, messageId, providerThreadId } = inbound;
  const receivedAt = new Date(inbound.receivedAt);
  const body = textBody || htmlBody;

  const { lead, campaign, thread: matchedThread } = await resolveInboundThread({ fromEmail, toEmail, subject });
  if (!lead && !matchedThread && !campaign) {
    return res.status(202).json({ success: true, matched: false, message: "Inbound email logged but no lead or thread matched." });
  }

  const userId = lead?.userId || matchedThread?.userId || campaign?.userId;
  const agentId = lead?.agentId || matchedThread?.agentId || campaign?.agentId;
  const thread = matchedThread || await findOrCreateThread({
    userId,
    agentId,
    leadId: lead?._id,
    campaignId: campaign?._id,
    subject,
    fromEmail,
    toEmail,
    status: "needs_reply",
    lastMessageAt: receivedAt
  });

  if (messageId) {
    const duplicate = await EmailMessage.findOne({ provider: "brevo", providerMessageId: messageId });
    if (duplicate) return res.status(200).json({ success: true, matched: true, duplicate: true, threadId: duplicate.threadId });
  }

  await EmailMessage.create({
    userId,
    threadId: thread._id,
    agentId,
    leadId: lead?._id || thread.leadId,
    campaignId: campaign?._id || thread.campaignId,
    direction: "inbound",
    fromEmail,
    toEmail,
    subject,
    body,
    htmlBody,
    textBody,
    provider: "brevo",
    providerMessageId: messageId,
    providerThreadId,
    receivedAt,
    status: "received",
    rawPayload: req.body
  });

  thread.status = "needs_reply";
  thread.lastMessageAt = receivedAt;
  thread.fromEmail = thread.fromEmail || fromEmail;
  thread.toEmail = thread.toEmail || toEmail;
  thread.normalizedSubject = thread.normalizedSubject || normalizeEmailSubject(subject);
  thread.replyToEmail = thread.replyToEmail || normalizeEmail(process.env.IMAP_USER || process.env.FROM_EMAIL);
  await thread.save();

  if (lead) {
    const negative = looksNegative(body);
    const positive = looksPositive(body);
    if (negative) {
      lead.status = "not_interested";
      lead.emailUnsubscribed = /unsubscribe|remove me|stop emailing|do not contact|don'?t contact/i.test(body) || lead.emailUnsubscribed;
      if (lead.emailUnsubscribed && !lead.emailUnsubscribedAt) lead.emailUnsubscribedAt = new Date();
      await pauseEmailSentFollowUpsForLead({
        userId,
        leadId: lead._id,
        campaignId: campaign?._id || thread.campaignId,
        note: "Cancelled because the lead replied not interested or unsubscribed."
      });
    } else if (positive) {
      lead.status = "interested";
      await pauseEmailSentFollowUpsForLead({
        userId,
        leadId: lead._id,
        campaignId: campaign?._id || thread.campaignId,
        note: "Paused because the lead replied positively."
      });
    } else if (!["interested", "Interested", "Booked", "appointment_booked", "not_interested", "Not Interested"].includes(lead.status)) {
      lead.status = "contacted";
    }
    await lead.save();
  }

  res.status(201).json({ success: true, matched: true, threadId: thread._id });
});

export const generateThreadReply = asyncHandler(async (req, res) => {
  const { goal = "Continue the conversation and book a call if appropriate", tone = "Professional" } = req.body;
  const thread = await EmailThread.findOne({ _id: req.params.id, ...filter(req) })
    .populate("leadId", "businessName contactName name email phone status city website requirement")
    .populate("agentId", "agentName businessName businessCategory services");
  if (!thread) throw new ApiError(404, "Email thread not found.");

  const messages = await EmailMessage.find({ threadId: thread._id, ...filter(req) }).sort({ createdAt: 1 }).limit(20);
  const latestInbound = [...messages].reverse().find((message) => message.direction === "inbound");
  const lead = thread.leadId;
  const agent = thread.agentId;

  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      subject: thread.subject?.toLowerCase().startsWith("re:") ? thread.subject : `Re: ${thread.subject || "Following up"}`,
      body: `Hi ${lead?.contactName || lead?.name || "there"},\n\nThanks for getting back to us. Happy to help with this. Would you be open to a quick call so we can understand what you need and share the best next step?\n\nBest,\n${agent?.agentName || "Team"}`
    });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const history = messages.map((message) => `${message.direction.toUpperCase()} ${message.fromEmail} -> ${message.toEmail}\nSubject: ${message.subject}\n${message.textBody || message.body || message.htmlBody}`).join("\n\n---\n\n");
  const prompt = `
Write a short professional email reply draft. Do not auto-send. Return only JSON with subject and body.

Goal: ${goal}
Tone: ${tone}

Agent:
- Name: ${agent?.agentName || ""}
- Business: ${agent?.businessName || ""}
- Category: ${agent?.businessCategory || ""}
- Services: ${agent?.services || ""}

Lead:
- Name: ${lead?.contactName || lead?.name || ""}
- Business: ${lead?.businessName || ""}
- Email: ${lead?.email || ""}
- City: ${lead?.city || ""}
- Requirement: ${lead?.requirement || ""}

Latest inbound reply:
${latestInbound?.textBody || latestInbound?.body || latestInbound?.htmlBody || ""}

Conversation history:
${history}

Rules:
- Keep it under 120 words.
- Be specific to the reply, but do not invent claims, prices, or appointment times.
- Include one clear next step.
- Preserve the existing thread subject using Re:.
`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.45, responseMimeType: "application/json" }
    });
    const parsed = JSON.parse(clean(response.text).replace(/^```json\s*/i, "").replace(/```$/i, ""));
    res.json({
      subject: clean(parsed.subject) || (thread.subject?.toLowerCase().startsWith("re:") ? thread.subject : `Re: ${thread.subject || "Following up"}`),
      body: clean(parsed.body)
    });
  } catch (error) {
    console.error("Email reply generation failed:", error.message);
    throw new ApiError(502, "AI reply generation failed.");
  }
});

export const sendThreadReply = asyncHandler(async (req, res) => {
  const { body, subject } = req.body;
  const mode = req.body.mode === "reply_all" ? "reply_all" : "reply";
  if (!clean(body)) throw new ApiError(400, "Reply body is required.");

  const thread = await EmailThread.findOne({ _id: req.params.id, ...filter(req) }).populate("leadId", "email contactName name businessName");
  if (!thread) throw new ApiError(404, "Email thread not found.");

  const integration = await requireGmailIntegration(req.user._id);
  const connectedEmail = gmailSender(integration);

  // Anchor on the latest inbound message (the one we're replying to); fall back to the newest message.
  const messages = await EmailMessage.find({ threadId: thread._id, ...filter(req) }).sort({ createdAt: 1 });
  const latestInbound = [...messages].reverse().find((message) => message.direction === "inbound");
  const anchor = latestInbound || messages[messages.length - 1] || {
    fromEmail: thread.fromEmail,
    toEmail: thread.toEmail
  };

  const { to, cc } = buildReplyRecipients({ mode, message: anchor, connectedEmail });
  if (!to.length) throw new ApiError(400, "The email could not be added to the original Gmail thread: no valid recipient.");

  const gmailThreadId = thread.threadHeaders?.providerThreadId || anchor.providerThreadId || "";
  const { inReplyTo, references } = buildReplyThreadingHeaders(anchor);
  const replySubject = assertSubject(buildReplySubject(subject || thread.subject));

  await chargeFeatureOrThrow({
    userId: req.user._id,
    featureKey: "email_send",
    idempotencyKey: `email_reply:${thread._id}:${Date.now()}`,
    metadata: { threadId: thread._id.toString(), mode }
  });

  try {
    const sendResult = await sendGmailEmail(integration, {
      to,
      cc,
      subject: replySubject,
      text: body,
      inReplyTo,
      references,
      threadId: gmailThreadId
    });

    const { thread: updated, message } = await storeSentGmailMessage({
      integration,
      existingThread: thread,
      agentId: thread.agentId,
      leadId: thread.leadId?._id || thread.leadId,
      campaignId: thread.campaignId,
      toEmail: to[0].email,
      toName: to[0].name,
      cc,
      subject: replySubject,
      text: body,
      inReplyTo,
      references,
      sendResult,
      source: "reply"
    });

    res.status(201).json({ success: true, thread: updated, message });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, safeGmailErrorMessage(error, "The reply could not be sent."));
  }
});

// Download a Gmail attachment by local message id + Gmail attachment id (ownership-checked).
export const getMessageAttachment = asyncHandler(async (req, res) => {
  const message = await EmailMessage.findOne({ _id: req.params.messageId, ...filter(req) });
  if (!message) throw new ApiError(404, "Message not found.");
  if (message.provider !== "gmail") throw new ApiError(400, "Attachments are only available for Gmail messages.");

  const meta = (message.attachments || []).find((att) => att.attachmentId === req.params.attachmentId);
  if (!meta) throw new ApiError(404, "Attachment not found.");

  const integration = await getOrCreateEmailIntegration(message.userId);
  if (!integration.gmail?.connected) throw new ApiError(400, "Gmail is not connected.");

  const dataB64Url = await fetchGmailAttachment(integration, message.providerMessageId, req.params.attachmentId);
  const buffer = Buffer.from(String(dataB64Url).replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const maxBytes = (Number(process.env.GMAIL_MAX_ATTACHMENT_MB) || 25) * 1024 * 1024;
  if (buffer.length > maxBytes) throw new ApiError(413, "Attachment is too large to download.");

  res.setHeader("Content-Type", safeContentType(meta.mimeType));
  res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(meta.filename)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(buffer);
});

// Gmail-backed search: queries Gmail directly, caches matches locally, returns normalized threads.
export const searchGmail = asyncHandler(async (req, res) => {
  const q = clean(req.query.q);
  if (!q) throw new ApiError(400, "Search query is required.");

  const integration = await requireGmailIntegration(req.user._id);
  let result;
  try {
    result = await searchGmailMessages(integration, q, { limit: Number(req.query.limit) || 25 });
  } catch (error) {
    throw new ApiError(502, safeGmailErrorMessage(error, "Gmail search failed."));
  }

  const threads = await EmailThread.find({ _id: { $in: result.threadIds || [] }, ...filter(req) })
    .populate("leadId", "businessName contactName name email phone status city")
    .populate("campaignId", "name subject")
    .populate("agentId", "agentName businessName")
    .sort({ lastMessageAt: -1 })
    .lean();

  const decorated = await decorateThreads(req, threads);
  res.json({ success: true, importedCount: result.importedCount || 0, threads: decorated });
});

export const backfillThreads = asyncHandler(async (req, res) => {
  const logs = await EmailLog.find({ ...filter(req), status: "sent" })
    .populate("campaignId", "name subject agentId")
    .populate("leadId", "agentId businessName contactName name email")
    .sort({ sentAt: 1, createdAt: 1 });

  let createdThreads = 0;
  let foundThreads = 0;
  let createdMessages = 0;
  let skippedMessages = 0;

  for (const log of logs) {
    const existingMessageQuery = {
      userId: log.userId,
      $or: [{ "rawPayload.emailLogId": log._id }]
    };
    if (log.providerMessageId) {
      existingMessageQuery.$or.push({
        provider: log.provider || "",
        providerMessageId: log.providerMessageId
      });
    }

    const existingMessage = await EmailMessage.findOne(existingMessageQuery);
    if (existingMessage) {
      skippedMessages += 1;
      continue;
    }

    const agentId = log.campaignId?.agentId || log.leadId?.agentId;
    const beforeThread = log.leadId?._id || log.campaignId?._id
      ? await EmailThread.findOne({
        userId: log.userId,
        ...(log.leadId?._id ? { leadId: log.leadId._id } : {}),
        ...(log.campaignId?._id ? { campaignId: log.campaignId._id } : {})
      })
      : null;

    const { thread, message } = await saveOutboundEmailMessage({
      userId: log.userId,
      agentId,
      leadId: log.leadId?._id || null,
      campaignId: log.campaignId?._id || null,
      subject: log.subject || log.campaignId?.subject || "Email outreach",
      body: log.body || "",
      toEmail: normalizeEmail(log.toEmail || log.leadId?.email),
      toName: leadName(log.leadId || {}),
      providerKey: log.provider || "",
      providerMessageId: log.providerMessageId || "",
      sentAt: log.sentAt || log.createdAt || new Date(),
      rawPayload: { source: "email_log_backfill", emailLogId: log._id }
    });

    if (beforeThread) foundThreads += 1;
    else createdThreads += 1;
    createdMessages += 1;

    console.info("[email] backfill message saved", {
      campaignId: log.campaignId?._id ? String(log.campaignId._id) : null,
      leadId: log.leadId?._id ? String(log.leadId._id) : null,
      toEmail: log.toEmail,
      threadId: String(thread._id),
      messageId: String(message._id),
      providerMessageId: log.providerMessageId || ""
    });
  }

  res.json({
    success: true,
    scannedLogs: logs.length,
    createdThreads,
    foundThreads,
    createdMessages,
    skippedMessages
  });
});
