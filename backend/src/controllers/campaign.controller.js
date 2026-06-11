import Agent from "../models/Agent.js";
import Campaign from "../models/Campaign.js";
import CampaignRecipient from "../models/CampaignRecipient.js";
import Lead from "../models/Lead.js";
import {
  addLeadRecipients,
  getOwnedCampaign,
  importRecipientRows,
  refreshCampaignStats,
  scheduleCampaignRecipients,
  userFilter
} from "../services/campaign.service.js";
import { normalizeMappedRow, parseImportFile } from "../services/importCalls.service.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const DEFAULT_TIMEZONE = "Asia/Kolkata";

function isAdminUser(req) {
  return ["admin", "super_admin"].includes(req.user.role);
}

function normalizeSpeed(speed = {}) {
  return {
    batchSize: Math.max(1, Number(speed.batchSize || process.env.CAMPAIGN_DEFAULT_BATCH_SIZE || 5)),
    delaySeconds: Math.max(0, Number(speed.delaySeconds || process.env.CAMPAIGN_DEFAULT_DELAY_SECONDS || 10)),
    maxParallelCalls: Math.max(1, Number(speed.maxParallelCalls || process.env.CAMPAIGN_MAX_PARALLEL_CALLS || 3))
  };
}

function normalizeRetryRules(rules = {}) {
  return {
    enabled: rules.enabled !== false,
    maxAttempts: Math.max(1, Number(rules.maxAttempts || 3)),
    retryDelayMinutes: Math.max(1, Number(rules.retryDelayMinutes || 120)),
    retryOnStatuses: Array.isArray(rules.retryOnStatuses) && rules.retryOnStatuses.length
      ? rules.retryOnStatuses
      : ["no_answer", "busy", "failed", "declined"]
  };
}

function sanitizeBody(body = {}) {
  const update = {};
  if (body.name !== undefined) update.name = String(body.name || "").trim();
  if (body.startAt !== undefined) update.startAt = body.startAt ? new Date(body.startAt) : undefined;
  if (body.timezone !== undefined) update.timezone = body.timezone || DEFAULT_TIMEZONE;
  if (body.callingSpeed) update.callingSpeed = normalizeSpeed(body.callingSpeed);
  if (body.retryRules) update.retryRules = normalizeRetryRules(body.retryRules);
  return update;
}

export const listCampaigns = asyncHandler(async (req, res) => {
  const campaigns = await Campaign.find(userFilter(req))
    .populate("agentId", "agentName businessName")
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(campaigns);
});

export const getCampaign = asyncHandler(async (req, res) => {
  const campaign = await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: isAdminUser(req) });
  await refreshCampaignStats(campaign._id);
  res.json(await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: isAdminUser(req) }));
});

export const createCampaign = asyncHandler(async (req, res) => {
  const agent = await Agent.findOne({ _id: req.body.agentId, ...userFilter(req) });
  if (!agent) throw new ApiError(404, "Agent not found.");
  const name = String(req.body.name || "").trim();
  if (!name) throw new ApiError(400, "Campaign name is required.");

  const campaign = await Campaign.create({
    userId: req.user._id,
    agentId: agent._id,
    name,
    type: "call",
    status: "draft",
    startAt: req.body.startAt ? new Date(req.body.startAt) : undefined,
    timezone: req.body.timezone || DEFAULT_TIMEZONE,
    callingSpeed: normalizeSpeed(req.body.callingSpeed),
    retryRules: normalizeRetryRules(req.body.retryRules)
  });

  res.status(201).json(campaign);
});

export const updateCampaign = asyncHandler(async (req, res) => {
  const campaign = await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: isAdminUser(req) });
  if (!["draft", "scheduled", "paused"].includes(campaign.status)) throw new ApiError(400, "Only draft, scheduled, or paused campaigns can be edited.");
  Object.assign(campaign, sanitizeBody(req.body));
  await campaign.save();
  res.json(campaign);
});

export const deleteCampaign = asyncHandler(async (req, res) => {
  const campaign = await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: isAdminUser(req) });
  if (["running", "scheduled"].includes(campaign.status)) throw new ApiError(400, "Cancel active campaign before deleting.");
  await CampaignRecipient.deleteMany({ campaignId: campaign._id });
  await campaign.deleteOne();
  res.json({ success: true });
});

export const addLeadsToCampaign = asyncHandler(async (req, res) => {
  const campaign = await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: false });
  if (campaign.status !== "draft") throw new ApiError(400, "Add recipients before starting the campaign.");
  const result = await addLeadRecipients({ campaign, leadIds: req.body.leadIds || [] });
  res.json(result);
});

export const importRecipients = asyncHandler(async (req, res) => {
  const campaign = await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: false });
  if (campaign.status !== "draft") throw new ApiError(400, "Import recipients before starting the campaign.");
  if (!req.body?.length) throw new ApiError(400, "Upload a CSV or XLSX file.");
  const rows = await parseImportFile({
    buffer: Buffer.from(req.body),
    fileName: req.query.fileName || req.headers["x-file-name"] || "campaign-recipients.csv",
    contentType: req.headers["content-type"] || ""
  });
  const normalizedRows = rows.map((row) => {
    const normalized = normalizeMappedRow(row, {});
    return {
      ...normalized,
      scheduledAt: row.scheduledAt || row.scheduled_at || row.startAt || row.start_at || "",
      notes: row.notes || row.note || ""
    };
  });
  res.json(await importRecipientRows({ campaign, rows: normalizedRows }));
});

export const startCampaign = asyncHandler(async (req, res) => {
  const campaign = await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: false });
  if (!["draft", "paused", "scheduled"].includes(campaign.status)) throw new ApiError(400, "Campaign cannot be started from current status.");
  if (req.body?.startAt) campaign.startAt = new Date(req.body.startAt);
  await campaign.save();
  res.json(await scheduleCampaignRecipients(campaign));
});

export const pauseCampaign = asyncHandler(async (req, res) => {
  const campaign = await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: isAdminUser(req) });
  campaign.status = "paused";
  await campaign.save();
  res.json(campaign);
});

export const resumeCampaign = asyncHandler(async (req, res) => {
  const campaign = await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: false });
  campaign.status = campaign.startAt && campaign.startAt > new Date() ? "scheduled" : "running";
  await campaign.save();
  res.json(campaign);
});

export const cancelCampaign = asyncHandler(async (req, res) => {
  const campaign = await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: isAdminUser(req) });
  campaign.status = "cancelled";
  await campaign.save();
  await CampaignRecipient.updateMany(
    { campaignId: campaign._id, status: { $in: ["queued", "scheduled"] } },
    { $set: { status: "cancelled" } }
  );
  res.json(await refreshCampaignStats(campaign._id));
});

export const listRecipients = asyncHandler(async (req, res) => {
  const campaign = await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: isAdminUser(req) });
  const recipients = await CampaignRecipient.find({ campaignId: campaign._id })
    .populate("leadId", "name businessName phone email")
    .populate("lastCallLogId", "normalizedStatus status createdAt")
    .sort({ createdAt: 1 })
    .limit(1000);
  res.json(recipients);
});

export const campaignStats = asyncHandler(async (req, res) => {
  const campaign = await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: isAdminUser(req) });
  res.json((await refreshCampaignStats(campaign._id)).stats);
});

export const retryFailed = asyncHandler(async (req, res) => {
  const campaign = await getOwnedCampaign({ userId: req.user._id, campaignId: req.params.id, allowAdmin: false });
  const statuses = campaign.retryRules?.retryOnStatuses || ["no_answer", "busy", "failed", "declined"];
  const result = await CampaignRecipient.updateMany(
    { campaignId: campaign._id, status: { $in: statuses }, attemptCount: { $lt: campaign.retryRules?.maxAttempts || 3 } },
    { $set: { status: "scheduled", scheduledAt: new Date(), lastError: "" } }
  );
  campaign.status = "running";
  await campaign.save();
  await refreshCampaignStats(campaign._id);
  res.json({ queued: result.modifiedCount || 0 });
});

export const campaignLeadOptions = asyncHandler(async (req, res) => {
  const agentId = req.query.agentId;
  const query = { ...userFilter(req) };
  if (agentId) query.agentId = agentId;
  res.json(await Lead.find(query).select("name businessName contactName phone email agentId").sort({ createdAt: -1 }).limit(500));
});
