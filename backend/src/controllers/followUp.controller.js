import Agent from "../models/Agent.js";
import EmailCampaign from "../models/EmailCampaign.js";
import FollowUp from "../models/FollowUp.js";
import Lead from "../models/Lead.js";
import { runFollowUp } from "../services/followUp.service.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function filter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
}

async function getOwnedFollowUp(req) {
  const followUp = await FollowUp.findOne({ _id: req.params.id, ...filter(req) })
    .populate("leadId", "name businessName contactName phone email city")
    .populate("agentId", "agentName businessName")
    .populate("campaignId", "name")
    .populate("callLogId", "normalizedStatus rawProviderStatus retryEligible retryScheduled status");
  if (!followUp) throw new ApiError(404, "Follow-up not found.");
  return followUp;
}

async function validateLinks(req, { agentId, leadId, campaignId }) {
  const [agent, lead, campaign] = await Promise.all([
    Agent.findOne({ _id: agentId, ...filter(req) }),
    Lead.findOne({ _id: leadId, ...filter(req) }),
    campaignId ? EmailCampaign.findOne({ _id: campaignId, ...filter(req) }) : null
  ]);

  if (!agent) throw new ApiError(404, "Agent not found.");
  if (!lead) throw new ApiError(404, "Lead not found.");
  if (campaignId && !campaign) throw new ApiError(404, "Campaign not found.");

  return { agent, lead, campaign };
}

export const listFollowUps = asyncHandler(async (req, res) => {
  const followUps = await FollowUp.find(filter(req))
    .populate("leadId", "name businessName contactName phone email city")
    .populate("agentId", "agentName businessName")
    .populate("campaignId", "name")
    .populate("callLogId", "normalizedStatus rawProviderStatus retryEligible retryScheduled status")
    .sort({ scheduledAt: 1, createdAt: -1 })
    .limit(200);

  res.json(followUps);
});

export const getFollowUp = asyncHandler(async (req, res) => {
  res.json(await getOwnedFollowUp(req));
});

export const createFollowUp = asyncHandler(async (req, res) => {
  const {
    agentId,
    leadId,
    campaignId,
    emailLogId,
    callLogId,
    type = "call",
    trigger = "manual",
    status = "scheduled",
    scheduledAt,
    maxAttempts = 3,
    note = ""
  } = req.body;

  await validateLinks(req, { agentId, leadId, campaignId });

  const followUp = await FollowUp.create({
    userId: req.user._id,
    agentId,
    leadId,
    campaignId,
    emailLogId,
    callLogId,
    type,
    trigger,
    status,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
    maxAttempts,
    note
  });

  res.status(201).json(followUp);
});

export const updateFollowUp = asyncHandler(async (req, res) => {
  const followUp = await FollowUp.findOne({ _id: req.params.id, ...filter(req) });
  if (!followUp) throw new ApiError(404, "Follow-up not found.");

  ["type", "trigger", "status", "scheduledAt", "maxAttempts", "note"].forEach((field) => {
    if (req.body[field] !== undefined) followUp[field] = field === "scheduledAt" ? new Date(req.body[field]) : req.body[field];
  });

  await followUp.save();
  res.json(followUp);
});

export const deleteFollowUp = asyncHandler(async (req, res) => {
  const followUp = await FollowUp.findOne({ _id: req.params.id, ...filter(req) });
  if (!followUp) throw new ApiError(404, "Follow-up not found.");
  await followUp.deleteOne();
  res.json({ success: true });
});

export const runFollowUpNow = asyncHandler(async (req, res) => {
  const followUp = await FollowUp.findOne({ _id: req.params.id, ...filter(req) });
  if (!followUp) throw new ApiError(404, "Follow-up not found.");
  if (followUp.status === "cancelled") throw new ApiError(400, "Cancelled follow-ups cannot be run.");
  if (followUp.status === "completed") throw new ApiError(400, "Completed follow-ups cannot be run again.");

  try {
    const result = await runFollowUp(followUp);
    res.json(result || followUp);
  } catch (error) {
    throw new ApiError(502, error.message || "Follow-up run failed.");
  }
});

export const rescheduleFollowUp = asyncHandler(async (req, res) => {
  const followUp = await FollowUp.findOne({ _id: req.params.id, ...filter(req) });
  if (!followUp) throw new ApiError(404, "Follow-up not found.");
  if (!req.body.scheduledAt) throw new ApiError(400, "scheduledAt is required.");

  followUp.scheduledAt = new Date(req.body.scheduledAt);
  followUp.status = "scheduled";
  followUp.lastError = "";
  await followUp.save();
  res.json(followUp);
});

export const cancelFollowUp = asyncHandler(async (req, res) => {
  const followUp = await FollowUp.findOne({ _id: req.params.id, ...filter(req) });
  if (!followUp) throw new ApiError(404, "Follow-up not found.");

  followUp.status = "cancelled";
  await followUp.save();
  res.json(followUp);
});
