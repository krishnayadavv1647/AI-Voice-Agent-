import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import { applyCallOutcomeToLog } from "../services/callOutcome.service.js";
import { extractRunId } from "../services/callLogMapper.js";
import { scheduleDograhStatusSync } from "../services/dograhCallStatusSync.service.js";
import { triggerDograhOutboundCallByWorkflow } from "../services/dograh.service.js";
import { runCustomAgent } from "../services/customAgentRuntime.js";
import { normalizeLeadToEnglish } from "../services/leadEnglishNormalizer.js";
import { defaultBioPage } from "../services/bioPageTemplates.js";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function requesterIp(req) {
  return (req.headers["x-forwarded-for"] || req.ip || req.socket?.remoteAddress || "unknown")
    .toString()
    .split(",")[0]
    .trim();
}

async function enforceCallbackLimits({ phoneNumber, ip }) {
  const since = todayStart();
  const [phoneCount, ipCount] = await Promise.all([
    Lead.countDocuments({ phone: phoneNumber, source: "callback_form", createdAt: { $gte: since } }),
    Lead.countDocuments({ source: "callback_form", "customFields.ip": ip, createdAt: { $gte: since } })
  ]);

  if (phoneCount >= 3 || ipCount >= 10) {
    throw new ApiError(429, "Too many callback requests. Please try again later.");
  }
}

function publicAgentResponse(agent) {
  const bioPage = { ...defaultBioPage(agent), ...(agent.bioPage?.toObject ? agent.bioPage.toObject() : agent.bioPage || {}) };
  const publicWebCallEnabled = Boolean((bioPage.showWebCallButton ?? bioPage.showWebCall) !== false && agent.publicWebCallEnabled && agent.dograhWidgetEnabled && agent.dograhEmbedToken);

  return {
    _id: agent._id,
    name: agent.businessName || agent.agentName || agent.name,
    publicTitle: agent.publicTitle || agent.businessName || agent.agentName || agent.name,
    publicDescription: agent.publicDescription || agent.businessDescription || agent.description || "",
    publicWelcomeMessage: agent.publicWelcomeMessage || agent.greetingMessage || agent.firstMessage || "",
    publicChatEnabled: Boolean(agent.publicChatEnabled),
    publicWebCallEnabled,
    publicSlug: agent.publicSlug,
    agentName: agent.agentName,
    businessName: agent.businessName,
    businessCategory: agent.businessCategory,
    businessDescription: agent.businessDescription,
    businessLocation: agent.businessLocation,
    workingHours: agent.workingHours,
    contactNumber: agent.contactNumber,
    services: agent.services,
    bioPage
  };
}

async function getPublicAgentBySlug(publicSlug) {
  const agent = await Agent.findOne({ publicSlug, isPublic: true, status: { $ne: "archived" } });
  if (!agent) throw new ApiError(404, "Public agent not found");
  return agent;
}

export const getPublicAgent = asyncHandler(async (req, res) => {
  const agent = await getPublicAgentBySlug(req.params.publicSlug);
  const bioPage = { ...defaultBioPage(agent), ...(agent.bioPage?.toObject ? agent.bioPage.toObject() : agent.bioPage || {}) };
  if (bioPage.isPublished === false) throw new ApiError(403, "This agent page is currently unavailable.");
  res.json(publicAgentResponse(agent));
});

export const getPublicAgentBioPage = asyncHandler(async (req, res) => {
  const value = req.params.idOrSlug;
  const query = Agent.db.base.Types.ObjectId.isValid(value)
    ? { _id: value, isPublic: true, status: { $ne: "archived" } }
    : { publicSlug: value, isPublic: true, status: { $ne: "archived" } };
  const agent = await Agent.findOne(query);
  if (!agent) throw new ApiError(404, "Public agent not found");

  const bioPage = { ...defaultBioPage(agent), ...(agent.bioPage?.toObject ? agent.bioPage.toObject() : agent.bioPage || {}) };
  if (bioPage.isPublished === false) throw new ApiError(403, "This page is not published.");

  res.json({
    _id: agent._id,
    publicSlug: agent.publicSlug,
    businessName: agent.businessName,
    category: agent.businessCategory,
    description: agent.businessDescription || agent.description || "",
    publicTitle: agent.publicTitle || agent.businessName || agent.agentName || agent.name,
    publicDescription: agent.publicDescription || agent.businessDescription || agent.description || "",
    publicChatEnabled: Boolean(agent.publicChatEnabled),
    publicWebCallEnabled: Boolean((bioPage.showWebCallButton ?? bioPage.showWebCall) !== false && agent.publicWebCallEnabled && agent.dograhWidgetEnabled && agent.dograhEmbedToken),
    bioPage
  });
});

export const chatWithPublicAgent = asyncHandler(async (req, res) => {
  const { message, sessionId } = req.body;
  const agent = await getPublicAgentBySlug(req.params.publicSlug);

  if (!agent.publicChatEnabled) throw new ApiError(403, "Public chat is not enabled for this agent.");
  if (!message || !message.trim()) throw new ApiError(400, "Message is required.");

  const conversationId = `public:${agent._id.toString()}:${sessionId || requesterIp(req)}`;
  const reply = await runCustomAgent({
    systemPrompt: agent.systemPrompt,
    userMessage: message.trim(),
    conversationId,
    tools: agent.tools,
    settings: agent.settings,
    agent
  });

  res.json({
    success: true,
    reply,
    response: reply,
    sessionId: sessionId || conversationId
  });
});

export const getPublicWebCallToken = asyncHandler(async (req, res) => {
  const agent = await getPublicAgentBySlug(req.params.publicSlug);
  const bioPage = { ...defaultBioPage(agent), ...(agent.bioPage?.toObject ? agent.bioPage.toObject() : agent.bioPage || {}) };

  if (bioPage.isPublished === false) throw new ApiError(403, "This agent page is currently unavailable.");
  if ((bioPage.showWebCallButton ?? bioPage.showWebCall) === false || !agent.publicWebCallEnabled) throw new ApiError(403, "Public web call is not enabled for this agent.");
  if (!agent.dograhWidgetEnabled || !agent.dograhEmbedToken) throw new ApiError(400, "Web call is not ready for this agent.");

  res.json({
    success: true,
    embedToken: agent.dograhEmbedToken
  });
});

export const requestCallbackCall = asyncHandler(async (req, res) => {
  const { name = "", phoneNumber, requirement = "", preferredTime = "" } = req.body;
  const agent = await Agent.findById(req.params.agentId);

  if (!agent) throw new ApiError(404, "Agent not found");
  if (!E164_PATTERN.test(phoneNumber || "")) {
    throw new ApiError(400, "Phone number must be in E.164 format, for example +918000281647.");
  }
  if (!agent.dograhWorkflowUuid) throw new ApiError(400, "AI callback is not ready for this agent.");
  if (!agent.callerIdNumber) throw new ApiError(400, "Caller ID number is not configured for this agent.");

  const ip = requesterIp(req);
  await enforceCallbackLimits({ phoneNumber, ip });

  const leadPayload = normalizeLeadToEnglish({
    userId: agent.userId,
    agentId: agent._id,
    name,
    phone: phoneNumber,
    requirement,
    preferredTime,
    source: "callback_form",
    status: "New",
    customFields: { ip }
  });

  const lead = await Lead.create(leadPayload);

  const payload = {
    phone_number: phoneNumber,
    calling_number: agent.callerIdNumber,
    initial_context: {
      customerName: leadPayload.name,
      phoneNumber,
      requirement: leadPayload.requirement,
      preferredTime: leadPayload.preferredTime,
      businessName: agent.businessName,
      agentName: agent.agentName,
      localAgentId: agent._id.toString()
    },
    metadata: {
      localAgentId: agent._id.toString(),
      leadId: lead._id.toString(),
      source: "callback_form"
    }
  };

  const dograhResponse = await triggerDograhOutboundCallByWorkflow(agent.dograhWorkflowUuid, payload);
  const dograhRunId = extractRunId(dograhResponse);
  const rawProviderStatus = dograhResponse?.status || "initiated";

  const callLog = await CallLog.create({
    userId: agent.userId,
    agentId: agent._id,
    leadId: lead._id,
    source: "callback_form",
    callDirection: "outbound",
    callerNumber: phoneNumber,
    callingNumber: agent.callerIdNumber,
    dograhWorkflowId: agent.dograhWorkflowId,
    dograhWorkflowUuid: agent.dograhWorkflowUuid,
    dograhRunId: dograhRunId ? String(dograhRunId) : null,
    status: rawProviderStatus,
    rawProviderStatus,
    providerPayload: dograhResponse,
    rawDograhPayload: dograhResponse,
    startedAt: new Date()
  });
  await applyCallOutcomeToLog(callLog, rawProviderStatus);
  await callLog.save();
  scheduleDograhStatusSync(callLog._id);

  lead.callLogId = callLog._id;
  await lead.save();

  res.status(202).json({
    success: true,
    message: "AI assistant is calling you now.",
    lead,
    callLog
  });
});
