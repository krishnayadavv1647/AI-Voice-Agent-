import { GoogleGenAI } from "@google/genai";
import Agent from "../models/Agent.js";
import EmailCampaign from "../models/EmailCampaign.js";
import EmailLog from "../models/EmailLog.js";
import EmailMessage from "../models/EmailMessage.js";
import EmailThread from "../models/EmailThread.js";
import Lead from "../models/Lead.js";
import WebhookEvent from "../models/WebhookEvent.js";
import { getEmailProvider, listEmailProviders } from "../services/email/index.js";
import { findInboundEmailMatch, normalizeEmailSubject, pollInboundEmails } from "../services/email/imapInboundPoller.js";
import { createEmailSentFollowUp, pauseEmailSentFollowUpsForLead } from "../services/followUp.service.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const UNSUBSCRIBE_FOOTER = "\n\nIf this is not relevant, reply unsubscribe and I will not contact you again.";
const DAILY_LIMITS = { free: 25, starter: 100, pro: 500, agency: 2000 };
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const SEND_BATCH_SIZE = 10;
const SEND_BATCH_DELAY_MS = 2000;
const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

function filter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
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
  const fromEmail = senderEmail();
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
    threadId: thread._id,
    agentId,
    leadId,
    campaignId,
    direction: "outbound",
    fromEmail,
    toEmail,
    subject,
    body,
    textBody: body,
    htmlBody: `<html><body>${String(body || "").replace(/\n/g, "<br>")}</body></html>`,
    provider: providerKey,
    providerMessageId,
    sentAt,
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

async function checkDailyLimit(req, plannedCount) {
  const limit = DAILY_LIMITS[req.user.plan] || DAILY_LIMITS.free;
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const sentToday = await EmailLog.countDocuments({
    userId: req.user._id,
    status: "sent",
    sentAt: { $gte: since }
  });

  if (sentToday + plannedCount > limit) {
    throw new ApiError(429, `Daily email limit reached for ${req.user.plan || "free"} plan.`);
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
  const toEmail = clean(testEmail || req.user.email).toLowerCase();
  if (!toEmail) throw new ApiError(400, "Test email address is required.");

  const provider = getEmailProvider();
  const fakeLead = {
    businessName: "Sample Business",
    contactName: req.user.name,
    name: req.user.name,
    email: toEmail,
    city: "Sample City"
  };

  const finalSubject = personalize(subject, { lead: fakeLead, agent });
  const finalBody = personalize(ensureFooter(body), { lead: fakeLead, agent });

  try {
    const sentAt = new Date();
    const replyTo = replyToFor({ leadId: null, campaignId: null });
    const result = await provider.service.sendEmail({
      toEmail,
      toName: req.user.name,
      subject: finalSubject,
      body: finalBody,
      replyTo
    });

    const { thread, message } = await saveOutboundEmailMessage({
      userId: req.user._id,
      agentId: agent._id,
      leadId: null,
      campaignId: null,
      subject: finalSubject,
      body: finalBody,
      toEmail,
      toName: req.user.name,
      providerKey: provider.key,
      providerMessageId: result.messageId,
      sentAt,
      rawPayload: { source: "test_email", replyTo }
    });

    console.info("[email] test send saved", {
      campaignId: null,
      leadId: null,
      toEmail,
      threadId: String(thread._id),
      messageId: String(message._id),
      providerMessageId: result.messageId
    });

    res.json({
      success: true,
      provider: provider.key,
      simulated: result.provider === "mock",
      messageId: result.messageId,
      threadId: thread._id,
      toEmail
    });
  } catch (error) {
    throw new ApiError(error.statusCode || 502, error.message || "Test email failed.");
  }
});

export const sendCampaign = asyncHandler(async (req, res) => {
  const campaign = await EmailCampaign.findOne({ _id: req.params.id, ...filter(req) });
  if (!campaign) throw new ApiError(404, "Email campaign not found.");

  const agent = await ensureAgentAccess(req, campaign.agentId);
  const leads = await Lead.find({ _id: { $in: campaign.selectedLeadIds }, ...filter(req) });
  const provider = getEmailProvider();

  const uniqueByEmail = new Map();
  const skipped = [];
  leads.forEach((lead) => {
    const email = clean(lead.email).toLowerCase();
    if (!email) {
      skipped.push({ lead, toEmail: "", error: "Missing email address." });
      return;
    }
    if (!validEmail(email)) {
      skipped.push({ lead, toEmail: email, error: "Invalid email address." });
      return;
    }
    if (isUnsubscribed(lead)) {
      skipped.push({ lead, toEmail: email, error: "Lead is unsubscribed." });
      return;
    }
    if (uniqueByEmail.has(email)) {
      skipped.push({ lead, toEmail: email, error: "Duplicate email in this campaign." });
      return;
    }
    uniqueByEmail.set(email, lead);
  });

  const recipients = Array.from(uniqueByEmail.values());
  await checkDailyLimit(req, recipients.length);

  campaign.status = "sending";
  campaign.totalRecipients = recipients.length;
  campaign.sentCount = 0;
  campaign.failedCount = 0;
  await campaign.save();

  let sentCount = 0;
  let failedCount = 0;
  const errors = [];

  for (const skippedItem of skipped) {
    await EmailLog.create({
      userId: req.user._id,
      campaignId: campaign._id,
      leadId: skippedItem.lead?._id,
      toEmail: skippedItem.toEmail || skippedItem.lead?.email || "missing",
      subject: campaign.subject,
      body: ensureFooter(campaign.body),
      provider: provider.key,
      status: "skipped",
      error: skippedItem.error,
      sentAt: new Date()
    });
  }

  for (let index = 0; index < recipients.length; index += SEND_BATCH_SIZE) {
    const batch = recipients.slice(index, index + SEND_BATCH_SIZE);

    await Promise.all(batch.map(async (lead) => {
      const toEmail = clean(lead.email).toLowerCase();
      const subject = personalize(campaign.subject, { lead, agent });
      const body = personalize(ensureFooter(campaign.body), { lead, agent });
      const sentAt = new Date();
      const replyTo = replyToFor({ leadId: lead._id, campaignId: campaign._id });

      try {
        const result = await provider.service.sendEmail({
          toEmail,
          toName: leadName(lead),
          subject,
          body,
          replyTo
        });

        sentCount += 1;
        const emailLog = await EmailLog.create({
          userId: req.user._id,
          campaignId: campaign._id,
          leadId: lead._id,
          toEmail,
          subject,
          body,
          provider: provider.key,
          providerMessageId: result.messageId,
          status: "sent",
          sentAt
        });

        const { thread, message: savedMessage } = await saveOutboundEmailMessage({
          userId: req.user._id,
          agentId: campaign.agentId,
          leadId: lead._id,
          campaignId: campaign._id,
          subject,
          body,
          toEmail,
          toName: leadName(lead),
          providerKey: provider.key,
          providerMessageId: result.messageId,
          sentAt,
          rawPayload: { replyTo }
        });

        console.info("[email] campaign send saved", {
          campaignId: String(campaign._id),
          leadId: String(lead._id),
          toEmail,
          threadId: String(thread._id),
          messageId: String(savedMessage._id),
          providerMessageId: result.messageId
        });

        await createEmailSentFollowUp({
          userId: req.user._id,
          agentId: campaign.agentId,
          leadId: lead._id,
          campaignId: campaign._id,
          emailLogId: emailLog._id
        });
      } catch (error) {
        const message = error.message || "Email send failed.";
        failedCount += 1;
        errors.push({ leadId: lead._id, toEmail, error: message });
        await EmailLog.create({
          userId: req.user._id,
          campaignId: campaign._id,
          leadId: lead._id,
          toEmail,
          subject,
          body,
          provider: provider.key,
          status: "failed",
          error: message,
          sentAt
        });
      }
    }));

    if (index + SEND_BATCH_SIZE < recipients.length) {
      await sleep(SEND_BATCH_DELAY_MS);
    }
  }

  campaign.sentCount = sentCount;
  campaign.failedCount = failedCount;
  campaign.status = sentCount > 0 && failedCount === 0 ? "sent" : sentCount > 0 ? "partially_sent" : "failed";
  await campaign.save();

  res.json({
    success: true,
    campaign,
    totalRecipients: recipients.length,
    sentCount,
    failedCount,
    skippedCount: skipped.length + Math.max(0, campaign.selectedLeadIds.length - leads.length),
    errors
  });
});

export const listThreads = asyncHandler(async (req, res) => {
  const query = { ...filter(req) };
  if (req.query.status && req.query.status !== "all") {
    if (req.query.status === "unread") query.status = { $in: ["unread", "needs_reply"] };
    else query.status = req.query.status;
  }
  if (req.query.leadId && OBJECT_ID_REGEX.test(req.query.leadId)) query.leadId = req.query.leadId;

  const threads = await EmailThread.find(query)
    .populate("leadId", "businessName contactName name email phone status city")
    .populate("campaignId", "name subject")
    .populate("agentId", "agentName businessName")
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .lean();

  const threadIds = threads.map((thread) => thread._id);
  const messages = await EmailMessage.find({ threadId: { $in: threadIds }, ...filter(req) })
    .sort({ createdAt: -1 })
    .lean();
  const latestByThread = messages.reduce((acc, message) => {
    const key = String(message.threadId);
    if (!acc[key]) acc[key] = message;
    return acc;
  }, {});
  const statsByThread = messages.reduce((acc, message) => {
    const key = String(message.threadId);
    acc[key] = acc[key] || { messagesCount: 0, unreadCount: 0 };
    acc[key].messagesCount += 1;
    if (message.direction === "inbound" && message.status === "received" && !message.readAt) acc[key].unreadCount += 1;
    return acc;
  }, {});

  res.json(threads.map((thread) => ({
    ...thread,
    leadName: thread.leadId?.businessName || thread.leadId?.contactName || thread.leadId?.name || "Unknown lead",
    email: thread.leadId?.email || thread.toEmail || thread.fromEmail || "",
    lastMessage: latestByThread[String(thread._id)] || null,
    lastMessagePreview: previewBody(latestByThread[String(thread._id)] || {}),
    unreadCount: statsByThread[String(thread._id)]?.unreadCount || 0,
    messagesCount: statsByThread[String(thread._id)]?.messagesCount || 0
  })));
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
    { $set: { readAt: now, status: "read" } }
  );

  res.json({
    success: true,
    markedCount: result.modifiedCount || 0,
    readAt: now
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
    fromEmail: normalizedFromEmail,
    toEmail: thread.toEmail || senderEmail(),
    subject: thread.subject,
    body: textBody,
    textBody,
    htmlBody: "",
    provider: "simulated",
    receivedAt,
    status: "received",
    rawPayload: {
      source: "simulate_inbound_reply",
      createdByUserId: req.user._id
    }
  });

  thread.status = "needs_reply";
  thread.lastMessageAt = receivedAt;
  thread.normalizedSubject = thread.normalizedSubject || normalizeEmailSubject(thread.subject || subject);
  await thread.save();

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
  const result = await pollInboundEmails();
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
    userId: req.user.role === "admin" ? undefined : req.user._id
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
  if (!clean(body)) throw new ApiError(400, "Reply body is required.");

  const thread = await EmailThread.findOne({ _id: req.params.id, ...filter(req) }).populate("leadId", "email contactName name businessName");
  if (!thread) throw new ApiError(404, "Email thread not found.");
  const toEmail = normalizeEmail(thread.leadId?.email || thread.fromEmail);
  if (!validEmail(toEmail)) throw new ApiError(400, "Thread lead email is missing or invalid.");

  const provider = getEmailProvider();
  const finalSubject = clean(subject || thread.subject || "Following up");
  const replySubject = finalSubject.toLowerCase().startsWith("re:") ? finalSubject : `Re: ${finalSubject}`;
  const sentAt = new Date();
  const result = await provider.service.sendEmail({
    toEmail,
    toName: leadName(thread.leadId || {}),
    subject: replySubject,
    body,
    replyTo: thread.replyToEmail || replyToFor({ leadId: thread.leadId?._id || thread.leadId, campaignId: thread.campaignId })
  });

  const message = await EmailMessage.create({
    userId: req.user._id,
    threadId: thread._id,
    agentId: thread.agentId,
    leadId: thread.leadId?._id || thread.leadId,
    campaignId: thread.campaignId,
    direction: "outbound",
    fromEmail: senderEmail(),
    toEmail,
    subject: replySubject,
    body,
    textBody: body,
    htmlBody: `<html><body>${String(body || "").replace(/\n/g, "<br>")}</body></html>`,
    provider: provider.key,
    providerMessageId: result.messageId,
    sentAt,
    status: "sent"
  });

  thread.status = "replied";
  thread.lastMessageAt = sentAt;
  thread.normalizedSubject = thread.normalizedSubject || normalizeEmailSubject(replySubject);
  thread.replyToEmail = thread.replyToEmail || normalizeEmail(process.env.IMAP_USER || process.env.FROM_EMAIL);
  await thread.save();

  res.status(201).json({ success: true, thread, message });
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
