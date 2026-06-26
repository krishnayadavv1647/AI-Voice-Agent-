import Agent from "../models/Agent.js";
import Campaign from "../models/Campaign.js";
import CampaignRecipient from "../models/CampaignRecipient.js";
import Lead from "../models/Lead.js";
import { normalizeCallOutcome } from "./callOutcome.service.js";
import { normalizePhone } from "./importCalls.service.js";
import { triggerOutboundCallForAgent } from "./outboundCall.service.js";
import { ApiError } from "../utils/apiError.js";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const FINAL_STATUSES = ["answered", "completed", "no_answer", "busy", "failed", "declined", "skipped", "cancelled"];

function campaignCallErrorMessage(error) {
  const data = error?.details || error?.response?.data || {};
  const status = error?.statusCode || error?.response?.status;
  const text = [
    error?.message,
    data?.userMessage,
    data?.message,
    data?.error,
    data?.detail,
    JSON.stringify(data)
  ].filter(Boolean).join(" ");

  if (/21219|unverified/i.test(text)) {
    return "Phone number is not verified in the calling provider. Verify this recipient number or upgrade/configure the provider account, then retry.";
  }

  if (status === 404 || /status code 404|not found/i.test(text)) {
    return "Dograh workflow was not found for this agent. Re-sync the agent workflow, then retry the failed campaign recipients.";
  }

  if (/telephony provider not configured/i.test(text)) {
    return "Telephony provider is not configured in Dograh. Configure the caller/telephony provider, re-sync the agent, then retry.";
  }

  if (/callerIdNumber is required|calling_number|caller id/i.test(text)) {
    return "Caller ID number is missing or invalid. Configure a valid outbound caller number, then retry.";
  }

  return error?.message || "Campaign call failed.";
}

export function userFilter(req) {
  return ["admin", "super_admin"].includes(req.user.role) ? {} : { userId: req.user._id };
}

export function normalizeCampaignStatus(status) {
  const normalized = normalizeCallOutcome(status);
  if (normalized === "answered") return "answered";
  if (normalized === "completed") return "completed";
  if (["no_answer", "busy", "failed", "declined"].includes(normalized)) return normalized;
  if (normalized === "cancelled") return "cancelled";
  return "calling";
}

export async function refreshCampaignStats(campaignId) {
  const rows = await CampaignRecipient.aggregate([
    { $match: { campaignId } },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  const counts = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  const totalRecipients = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const stats = {
    totalRecipients,
    queued: counts.queued || 0,
    running: counts.calling || 0,
    completed: counts.completed || 0,
    answered: counts.answered || 0,
    noAnswer: counts.no_answer || 0,
    busy: counts.busy || 0,
    failed: counts.failed || 0,
    declined: counts.declined || 0
  };

  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return null;
  campaign.stats = { ...(campaign.stats?.toObject?.() || campaign.stats || {}), ...stats };

  if (campaign.status === "running" || campaign.status === "scheduled") {
    const remaining = await CampaignRecipient.countDocuments({
      campaignId,
      status: { $in: ["queued", "scheduled", "calling"] }
    });
    if (!remaining && totalRecipients > 0) {
      campaign.status = "completed";
      campaign.completedAt = new Date();
    }
  }

  await campaign.save();
  return campaign;
}

export async function getOwnedCampaign({ userId, campaignId, allowAdmin = false }) {
  const filter = allowAdmin ? { _id: campaignId } : { _id: campaignId, userId };
  const campaign = await Campaign.findOne(filter).populate("agentId", "agentName businessName dograhWorkflowUuid callerIdNumber");
  if (!campaign) throw new ApiError(404, "Campaign not found.");
  return campaign;
}

async function upsertLeadForRecipient({ userId, agentId, name, phone, email, city, notes }) {
  return Lead.findOneAndUpdate(
    { userId, agentId, phone },
    {
      $setOnInsert: { userId, agentId, phone, source: "campaign", status: "New" },
      $set: { name: name || phone, email: email || undefined, city: city || undefined },
      ...(notes ? { $push: { notes: { text: notes } } } : {})
    },
    { new: true, upsert: true }
  );
}

export async function addLeadRecipients({ campaign, leadIds = [] }) {
  const leads = await Lead.find({ _id: { $in: leadIds }, userId: campaign.userId, agentId: campaign.agentId });
  let created = 0;
  let skipped = 0;

  for (const lead of leads) {
    const phone = normalizePhone(lead.phone);
    if (!phone || !E164_PATTERN.test(phone)) {
      skipped += 1;
      continue;
    }
    try {
      await CampaignRecipient.create({
        userId: campaign.userId,
        campaignId: campaign._id,
        agentId: campaign.agentId,
        leadId: lead._id,
        name: lead.name || lead.businessName || lead.contactName || phone,
        phone,
        email: lead.email,
        status: "queued",
        maxAttempts: campaign.retryRules?.maxAttempts || 3
      });
      created += 1;
    } catch (error) {
      if (error.code === 11000) skipped += 1;
      else throw error;
    }
  }

  await refreshCampaignStats(campaign._id);
  return { created, skipped };
}

export async function importRecipientRows({ campaign, rows = [] }) {
  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    const phone = normalizePhone(row.phone);
    if (!phone || !E164_PATTERN.test(phone)) {
      skipped += 1;
      errors.push(`${row.phone || "missing phone"}: invalid phone`);
      continue;
    }

    try {
      const lead = await upsertLeadForRecipient({
        userId: campaign.userId,
        agentId: campaign.agentId,
        name: row.name,
        phone,
        email: row.email,
        city: row.city,
        notes: row.notes
      });
      await CampaignRecipient.create({
        userId: campaign.userId,
        campaignId: campaign._id,
        agentId: campaign.agentId,
        leadId: lead._id,
        name: row.name || lead.name || phone,
        phone,
        email: row.email,
        status: "queued",
        scheduledAt: row.scheduledAt ? new Date(row.scheduledAt) : undefined,
        maxAttempts: campaign.retryRules?.maxAttempts || 3,
        notes: row.notes
      });
      created += 1;
    } catch (error) {
      skipped += 1;
      errors.push(`${phone}: ${error.code === 11000 ? "duplicate" : error.message}`);
    }
  }

  await refreshCampaignStats(campaign._id);
  return { created, skipped, errors };
}

export async function scheduleCampaignRecipients(campaign) {
  const recipients = await CampaignRecipient.find({
    campaignId: campaign._id,
    status: "queued"
  }).sort({ createdAt: 1 });
  if (!recipients.length) throw new ApiError(400, "Add recipients before starting campaign.");

  const startAt = campaign.startAt && campaign.startAt > new Date() ? campaign.startAt : new Date();
  const batchSize = Math.max(1, Number(campaign.callingSpeed?.batchSize) || 5);
  const delaySeconds = Math.max(0, Number(campaign.callingSpeed?.delaySeconds) || 10);

  for (let index = 0; index < recipients.length; index += 1) {
    const batchIndex = Math.floor(index / batchSize);
    recipients[index].scheduledAt = recipients[index].scheduledAt || new Date(startAt.getTime() + batchIndex * delaySeconds * 1000);
    recipients[index].status = "scheduled";
    recipients[index].maxAttempts = campaign.retryRules?.maxAttempts || 3;
    recipients[index].lastError = "";
    await recipients[index].save();
  }

  campaign.startAt = startAt;
  campaign.status = startAt <= new Date() ? "running" : "scheduled";
  campaign.startedAt = campaign.startedAt || new Date();
  await campaign.save();
  return refreshCampaignStats(campaign._id);
}

export async function triggerCampaignRecipient(recipient) {
  const campaign = await Campaign.findOne({
    _id: recipient.campaignId,
    status: { $in: ["scheduled", "running"] }
  });
  if (!campaign) return null;

  const claimed = await CampaignRecipient.findOneAndUpdate(
    { _id: recipient._id, status: "scheduled" },
    { $set: { status: "calling", lastError: "" }, $inc: { attemptCount: 1 } },
    { new: true }
  );
  if (!claimed) {
    console.log("[Campaign Worker] call skipped", { recipientId: recipient._id.toString(), reason: "status changed" });
    return null;
  }

  console.log("[Campaign Worker] triggering Dograh call", {
    campaignId: campaign._id.toString(),
    recipientId: claimed._id.toString(),
    phone: claimed.phone
  });

  try {
    const agent = await Agent.findOne({ _id: claimed.agentId, userId: claimed.userId });
    if (!agent) throw new Error("Linked agent was not found.");

    const { callLog } = await triggerOutboundCallForAgent({
      agent,
      userId: claimed.userId,
      phoneNumber: claimed.phone,
      leadId: claimed.leadId,
      source: "campaign",
      metadata: {
        campaignId: campaign._id.toString(),
        campaignRecipientId: claimed._id.toString(),
        leadId: claimed.leadId?.toString(),
        agentId: claimed.agentId.toString()
      }
    });

    claimed.lastCallLogId = callLog._id;
    claimed.dograhRunId = callLog.dograhRunId;
    claimed.lastOutcome = callLog.normalizedStatus;
    await claimed.save();

    callLog.campaignId = campaign._id;
    callLog.campaignRecipientId = claimed._id;
    callLog.leadId = claimed.leadId || callLog.leadId;
    await callLog.save();

    campaign.status = "running";
    await campaign.save();
    await refreshCampaignStats(campaign._id);

    console.log("[Campaign Worker] call triggered", {
      campaignId: campaign._id.toString(),
      recipientId: claimed._id.toString(),
      callLogId: callLog._id.toString(),
      dograhRunId: callLog.dograhRunId
    });

    return claimed;
  } catch (error) {
    claimed.status = "failed";
    claimed.lastError = campaignCallErrorMessage(error);
    claimed.lastOutcome = "failed";
    await claimed.save();
    await refreshCampaignStats(campaign._id);
    console.error("[Campaign Worker] call failed", {
      campaignId: campaign._id.toString(),
      recipientId: claimed._id.toString(),
      error: claimed.lastError
    });
    return claimed;
  }
}

export async function syncCampaignRecipientFromCall(callLog) {
  if (!callLog?.campaignRecipientId) return null;
  const recipient = await CampaignRecipient.findById(callLog.campaignRecipientId);
  if (!recipient) return null;

  const campaign = await Campaign.findById(recipient.campaignId);
  if (!campaign) return null;

  const outcome = normalizeCampaignStatus(callLog.normalizedStatus || callLog.status);
  recipient.lastCallLogId = callLog._id;
  recipient.dograhRunId = callLog.dograhRunId || recipient.dograhRunId;
  recipient.lastOutcome = outcome;

  if (outcome === "calling") {
    recipient.status = "calling";
  } else if (campaign.retryRules?.enabled && campaign.retryRules.retryOnStatuses?.includes(outcome) && recipient.attemptCount < (recipient.maxAttempts || 3)) {
    recipient.status = "scheduled";
    recipient.scheduledAt = new Date(Date.now() + (campaign.retryRules.retryDelayMinutes || 120) * 60 * 1000);
  } else {
    recipient.status = outcome;
  }

  await recipient.save();
  await refreshCampaignStats(campaign._id);
  return recipient;
}

export async function runnableCampaignCapacity(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign || !["scheduled", "running"].includes(campaign.status)) return 0;
  const maxParallel = Math.max(1, Number(campaign.callingSpeed?.maxParallelCalls) || 3);
  const running = await CampaignRecipient.countDocuments({ campaignId, status: "calling" });
  return Math.max(0, maxParallel - running);
}

export { FINAL_STATUSES };
