import EmailCampaign from "../models/EmailCampaign.js";
import EmailCampaignRecipient from "../models/EmailCampaignRecipient.js";
import EmailIntegration from "../models/EmailIntegration.js";
import EmailLog from "../models/EmailLog.js";
import User from "../models/User.js";
import { gmailDailyLimit } from "../config/gmailLimits.js";
import { emitToUser } from "../services/emailRealtime.service.js";
import { createEmailSentFollowUp } from "../services/followUp.service.js";
import { sendGmailEmail } from "../services/gmail/gmailSend.service.js";
import { storeSentGmailMessage } from "../services/gmail/gmailStore.service.js";
import { classifyGmailError, isGmailAuthError, isGmailRetryable, safeGmailErrorMessage } from "../services/gmail/gmailErrors.js";
import { markGmailErrorState } from "../services/gmail/gmailOAuth.service.js";

const DEFAULT_INTERVAL_SECONDS = 10;
const WORKER_ID = `gmail-campaign-${process.pid}`;

let intervalId = null;
let running = false;

function intEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sentTodayCount(userId) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  return EmailLog.countDocuments({ userId, provider: "gmail", status: "sent", sentAt: { $gte: since } });
}

function startOfTomorrow() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d;
}

// Atomically claims one due recipient. The status flip to "processing" is the mutual-exclusion
// guard — two workers can never claim the same row.
async function claimRecipient() {
  const now = new Date();
  return EmailCampaignRecipient.findOneAndUpdate(
    { status: "queued", nextAttemptAt: { $lte: now } },
    { $set: { status: "processing", lockedAt: now, lockedBy: WORKER_ID }, $inc: { attempts: 1 } },
    { sort: { nextAttemptAt: 1 }, new: true }
  );
}

async function recalcCampaign(campaignId) {
  const counts = await EmailCampaignRecipient.aggregate([
    { $match: { campaignId } },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  const map = counts.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {});
  const sent = map.sent || 0;
  const failed = map.failed || 0;
  const skipped = map.skipped || 0;
  const paused = map.paused || 0;
  const pending = (map.queued || 0) + (map.processing || 0);

  const campaign = await EmailCampaign.findById(campaignId);
  if (!campaign) return;
  campaign.sentCount = sent;
  campaign.failedCount = failed;
  campaign.skippedCount = Math.max(campaign.skippedCount || 0, skipped);

  if (pending > 0) {
    campaign.status = "sending";
  } else if (paused > 0) {
    campaign.status = "paused";
    campaign.completedAt = new Date();
  } else if (sent > 0 && failed === 0) {
    campaign.status = "sent";
    campaign.completedAt = new Date();
  } else if (sent > 0) {
    campaign.status = "partially_sent";
    campaign.completedAt = new Date();
  } else {
    campaign.status = "failed";
    campaign.completedAt = new Date();
  }
  await campaign.save();
  emitToUser(campaign.userId, "email:campaign-status", {
    campaignId: campaign._id,
    status: campaign.status,
    sentCount: sent,
    failedCount: failed,
    pending
  });
}

// Pauses every still-pending recipient for a campaign (used when Gmail auth permanently fails).
async function pauseCampaignRecipients(campaignId, reason) {
  await EmailCampaignRecipient.updateMany(
    { campaignId, status: { $in: ["queued", "processing"] } },
    { $set: { status: "paused", error: reason } }
  );
}

async function processRecipient(recipient) {
  const campaign = await EmailCampaign.findById(recipient.campaignId);
  // Only "queued"/"sending" campaigns are runnable; anything else (paused, failed, draft) pauses.
  if (!campaign || !["queued", "sending"].includes(campaign.status)) {
    recipient.status = "paused";
    recipient.error = campaign ? `Campaign is ${campaign.status}.` : "Campaign not found.";
    await recipient.save();
    return;
  }

  const integration = await EmailIntegration.findById(recipient.emailIntegrationId)
    || await EmailIntegration.findOne({ userId: recipient.userId });
  if (!integration?.gmail?.connected) {
    recipient.status = "paused";
    recipient.error = "Gmail is not connected. Reconnect Gmail to resume.";
    await recipient.save();
    await pauseCampaignRecipients(campaign._id, "Gmail is not connected.");
    return;
  }

  // App-level daily cap: reschedule to tomorrow rather than failing.
  const user = await User.findById(recipient.userId).select("plan");
  const limit = gmailDailyLimit(user?.plan);
  const sentToday = await sentTodayCount(recipient.userId);
  if (sentToday >= limit) {
    recipient.status = "queued";
    recipient.nextAttemptAt = startOfTomorrow();
    recipient.error = "Daily Gmail sending limit reached. Rescheduled for tomorrow.";
    await recipient.save();
    return;
  }

  try {
    const sendResult = await sendGmailEmail(integration, {
      to: [{ email: recipient.toEmail, name: recipient.toName }],
      subject: recipient.personalizedSubject,
      text: recipient.personalizedBody
    });

    const emailLog = await EmailLog.create({
      userId: recipient.userId,
      campaignId: campaign._id,
      leadId: recipient.leadId,
      toEmail: recipient.toEmail,
      subject: recipient.personalizedSubject,
      body: recipient.personalizedBody,
      provider: "gmail",
      providerMessageId: sendResult.id,
      status: "sent",
      sentAt: new Date()
    });

    await storeSentGmailMessage({
      integration,
      agentId: recipient.agentId,
      leadId: recipient.leadId,
      campaignId: campaign._id,
      toEmail: recipient.toEmail,
      toName: recipient.toName,
      subject: recipient.personalizedSubject,
      text: recipient.personalizedBody,
      sendResult,
      source: "campaign"
    });

    await createEmailSentFollowUp({
      userId: recipient.userId,
      agentId: recipient.agentId,
      leadId: recipient.leadId,
      campaignId: campaign._id,
      emailLogId: emailLog._id
    });

    recipient.status = "sent";
    recipient.providerMessageId = sendResult.id;
    recipient.providerThreadId = sendResult.threadId;
    recipient.sentAt = new Date();
    recipient.error = "";
    recipient.lockedAt = null;
    recipient.lockedBy = "";
    await recipient.save();
  } catch (error) {
    const maxRetries = intEnv("GMAIL_SEND_MAX_RETRIES", 3);

    // Permanent auth failure: stop the whole campaign and flag the integration for reconnect.
    if (isGmailAuthError(error)) {
      await markGmailErrorState(integration, error);
      recipient.status = "paused";
      recipient.error = "Gmail authorization expired. Reconnect Gmail to resume.";
      await recipient.save();
      await pauseCampaignRecipients(campaign._id, "Gmail authorization expired.");
      return;
    }

    if (isGmailRetryable(error) && recipient.attempts < maxRetries) {
      // Exponential backoff; rate-limit errors wait longer.
      const base = classifyGmailError(error) === "rate_limit" ? 60 : 30;
      const backoffSeconds = base * 2 ** (recipient.attempts - 1);
      recipient.status = "queued";
      recipient.nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000);
      recipient.error = safeGmailErrorMessage(error);
      await recipient.save();
      return;
    }

    // Permanent / retries exhausted → fail this recipient and log it.
    recipient.status = "failed";
    recipient.error = safeGmailErrorMessage(error, "The email could not be sent.");
    await recipient.save();
    await EmailLog.create({
      userId: recipient.userId,
      campaignId: campaign._id,
      leadId: recipient.leadId,
      toEmail: recipient.toEmail,
      subject: recipient.personalizedSubject,
      body: recipient.personalizedBody,
      provider: "gmail",
      status: "failed",
      error: recipient.error,
      sentAt: new Date()
    });
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const perTickCap = intEnv("GMAIL_CAMPAIGN_TICK_BATCH", 10);
    const delayMs = intEnv("GMAIL_SEND_DELAY_MS", 5000);
    const touchedCampaigns = new Set();

    for (let i = 0; i < perTickCap; i += 1) {
      const recipient = await claimRecipient();
      if (!recipient) break;
      touchedCampaigns.add(String(recipient.campaignId));
      await processRecipient(recipient);
      await sleep(delayMs);
    }

    for (const campaignId of touchedCampaigns) {
      await recalcCampaign(campaignId).catch((error) =>
        console.error("[gmail-campaign] recalc failed", { message: error.message })
      );
    }
  } catch (error) {
    console.error("[gmail-campaign] tick failed", { message: error.message });
  } finally {
    running = false;
  }
}

export function startGmailCampaignWorker() {
  if (intervalId || process.env.NODE_ENV === "test") return;
  if (process.env.GMAIL_CAMPAIGN_WORKER_ENABLED === "false") return;
  const intervalSeconds = intEnv("GMAIL_CAMPAIGN_WORKER_INTERVAL_SECONDS", DEFAULT_INTERVAL_SECONDS);
  console.log("[gmail-campaign] worker started", { intervalSeconds });
  intervalId = setInterval(tick, intervalSeconds * 1000);
  tick();
}
