import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import TelephonyConfig from "../models/TelephonyConfig.js";
import {
  createDograhEmbedToken,
  deleteDograhEmbedToken,
  triggerDograhOutboundCallByWorkflow,
  triggerDograhTestCallByWorkflow
} from "../services/dograh.service.js";
import { generateAgentTextReply } from "../services/gemini.service.js";
import { generateSystemPrompt } from "../services/promptGenerator.js";
import { extractCallFields, extractRunId } from "../services/callLogMapper.js";
import { getProvider } from "../providers/index.js";
import { runCustomAgent } from "../services/customAgentRuntime.js";

function userFilter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
}

function slugifyAgentName(value = "") {
  const slug = String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return slug || `agent-${Math.random().toString(36).slice(2, 8)}`;
}

async function generateUniquePublicSlug(name) {
  const baseSlug = slugifyAgentName(name);
  let slug = baseSlug;
  let exists = await Agent.exists({ publicSlug: slug });

  while (exists) {
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
    exists = await Agent.exists({ publicSlug: slug });
  }

  return slug;
}

async function normalizeAgentProvider(agent) {
  let changed = false;

  if (agent.dograhWorkflowId && !agent.providerWorkflowId) {
    agent.provider = "dograh";
    agent.providerWorkflowId = agent.dograhWorkflowId;
    changed = true;
  }

  if (!agent.provider) {
    agent.provider = agent.dograhWorkflowId ? "dograh" : "custom";
    changed = true;
  }

  if (!agent.publicSlug) {
    agent.publicSlug = await generateUniquePublicSlug(agent.agentName || agent.name || agent.businessName);
    changed = true;
  }

  if (changed) await agent.save();
  return agent;
}

async function getOwnedAgent(req) {
  const agent = await Agent.findOne({
    _id: req.params.id,
    ...userFilter(req),
  });

  if (!agent) throw new ApiError(404, "Agent not found");

  return normalizeAgentProvider(agent);
}

async function getOwnedAgentById(req, agentId) {
  const agent = await Agent.findOne({
    _id: agentId,
    ...userFilter(req),
  });

  if (!agent) throw new ApiError(404, "Agent not found");

  return normalizeAgentProvider(agent);
}

function getAgentDograhWorkflowId(agent) {
  return (
    agent.providerWorkflowId ||
    agent.dograhWorkflowId ||
    agent.workflowId ||
    agent.dograhWorkflowUuid ||
    null
  );
}

function assertE164(value, fieldName) {
  if (!value || !/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new ApiError(
      400,
      `${fieldName} must be in E.164 format, for example +17578297060`
    );
  }
}

function validateEditableAgentFields(agent) {
  const validLanguages = ["english", "hindi", "hinglish", "hindi_english", "English", "Hindi", "Hinglish", "Hindi + English"];
  const validCallModes = ["outbound", "test", "callback"];

  if (!agent.agentName || !agent.businessName || !agent.businessCategory) {
    throw new ApiError(400, "Agent name, business name, and business category are required");
  }

  if (!agent.systemPrompt || !agent.systemPrompt.trim()) {
    throw new ApiError(400, "System prompt should not be empty");
  }

  if (agent.language && !validLanguages.includes(agent.language)) {
    throw new ApiError(400, "Language is not valid");
  }

  if (agent.callMode && !validCallModes.includes(agent.callMode)) {
    throw new ApiError(400, "Call mode is not valid");
  }
}

function cleanOptionalObjectId(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!String(value).trim()) return null;
  if (!Agent.db.base.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `${fieldName} is not valid`);
  }
  return value;
}

function sanitizeAgentBody(body = {}) {
  const sanitized = { ...body };
  const telephonyConfigId = cleanOptionalObjectId(sanitized.telephonyConfigId, "telephonyConfigId");

  if (telephonyConfigId === undefined) {
    delete sanitized.telephonyConfigId;
  } else {
    sanitized.telephonyConfigId = telephonyConfigId;
  }

  return sanitized;
}

async function syncTelephonyConfigForAgent(agent, telephonyConfigId) {
  const unlinkFilter = { userId: agent.userId, linkedAgentId: agent._id };
  if (telephonyConfigId) unlinkFilter._id = { $ne: telephonyConfigId };

  await TelephonyConfig.updateMany(
    unlinkFilter,
    { $set: { linkedAgentId: null } }
  );

  if (!telephonyConfigId) return;

  const config = await TelephonyConfig.findOne({ _id: telephonyConfigId, userId: agent.userId });
  if (!config) throw new ApiError(400, "Telephony configuration was not found for this user");

  config.linkedAgentId = agent._id;
  await config.save();

  agent.telephonyProvider = config.provider;
  agent.connectedPhoneNumber = config.phoneNumber;
}

function buildProviderResultPatch(agent, result = {}, syncedAt = new Date()) {
  const set = {
    provider: result.provider || agent.provider || "custom",
    lastSyncedAt: syncedAt
  };
  const unset = {};

  if (result.providerWorkflowId || agent.providerWorkflowId) {
    set.providerWorkflowId = result.providerWorkflowId || agent.providerWorkflowId;
  }

  if (result.providerAgentId || agent.providerAgentId) {
    set.providerAgentId = result.providerAgentId || agent.providerAgentId;
  }

  if (set.provider === "dograh" || result.dograhWorkflowId) {
    set.dograhWorkflowId = result.dograhWorkflowId || agent.dograhWorkflowId || result.providerWorkflowId;
    set.dograhWorkflowUuid = result.dograhWorkflowUuid || agent.dograhWorkflowUuid;
    set.dograhWorkflowName = result.dograhWorkflowName || agent.dograhWorkflowName || agent.agentName;
    set.dograhStatus = result.status || agent.dograhStatus;
    set.dograhRawResponse = result.raw || agent.dograhRawResponse;
    set.dograhLastSyncedAt = syncedAt;
    set.dograhNeedsUpdate = false;

    if (set.dograhWorkflowUuid) {
      set.status = "Connected";
    }

    unset.dograhError = "";
  }

  for (const [key, value] of Object.entries(set)) {
    if (value === undefined) delete set[key];
  }

  return Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set };
}

function applyProviderResult(agent, result = {}, syncedAt = new Date()) {
  agent.provider = result.provider || agent.provider || "custom";
  agent.providerWorkflowId = result.providerWorkflowId || agent.providerWorkflowId;
  agent.providerAgentId = result.providerAgentId || agent.providerAgentId;
  agent.lastSyncedAt = syncedAt;

  if (agent.provider === "dograh" || result.dograhWorkflowId) {
    agent.dograhWorkflowId = result.dograhWorkflowId || agent.dograhWorkflowId || result.providerWorkflowId;
    agent.dograhWorkflowUuid = result.dograhWorkflowUuid || agent.dograhWorkflowUuid;
    agent.dograhWorkflowName = result.dograhWorkflowName || agent.dograhWorkflowName || agent.agentName;
    agent.dograhStatus = result.status || agent.dograhStatus;
    agent.dograhError = undefined;
    agent.dograhRawResponse = result.raw || agent.dograhRawResponse;
    agent.dograhLastSyncedAt = syncedAt;
    agent.dograhNeedsUpdate = false;
    agent.status = agent.dograhWorkflowUuid ? "Connected" : agent.status;
  }

  return agent;
}

async function syncProvider(agent, action, { createIfMissing = false } = {}) {
  const providerName = agent.provider || (agent.dograhWorkflowId ? "dograh" : "custom");
  const providerWorkflowId = agent.providerWorkflowId || agent.dograhWorkflowId || agent.workflowId;

  if (action === "update" && providerName !== "custom" && !providerWorkflowId && !createIfMissing) {
    throw new ApiError(
      400,
      "Provider workflow ID missing. Enable createIfMissing to create a new provider workflow."
    );
  }

  const provider = getProvider(providerName);
  const operation = action === "update" && !providerWorkflowId && createIfMissing ? "create" : action;

  console.log("[Provider Sync]", {
    agentId: agent._id.toString(),
    provider: providerName,
    providerWorkflowId,
    action: operation,
    externalWorkflowCreated: operation === "create"
  });

  const result = await provider[operation](agent);
  const syncedAt = new Date();
  const providerPatch = buildProviderResultPatch(agent, result, syncedAt);
  await Agent.findOneAndUpdate(
    { _id: agent._id },
    providerPatch,
    { new: true, runValidators: true }
  );
  applyProviderResult(agent, result, syncedAt);

  return result;
}

function getDograhWebhookUrl() {
  const backendUrl = process.env.PUBLIC_BACKEND_URL?.trim().replace(/\/$/, "");

  if (!backendUrl) {
    throw new ApiError(
      500,
      "PUBLIC_BACKEND_URL is missing. Set it to your deployed backend URL."
    );
  }

  if (backendUrl.includes("localhost") || backendUrl.includes("127.0.0.1")) {
    throw new ApiError(
      500,
      "PUBLIC_BACKEND_URL must be a deployed public backend URL, not localhost."
    );
  }

  const webhookUrl = `${backendUrl}/api/webhooks/dograh`;

  if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    throw new ApiError(
      500,
      "Generated webhook URL is invalid because it contains localhost or 127.0.0.1."
    );
  }

  return webhookUrl;
}

function dograhCallPayload(agent, phoneNumber) {
  const webhookUrl = getDograhWebhookUrl();

  return {
    phone_number: phoneNumber,
    calling_number: agent.callerIdNumber,
    webhook_url: webhookUrl,

    initial_context: {
      businessName: agent.businessName,
      agentName: agent.agentName,
      localAgentId: agent._id.toString(),
      userId: agent.userId.toString(),
    },

    metadata: {
      localAgentId: agent._id.toString(),
      userId: agent.userId.toString(),
      dograhWorkflowUuid: agent.dograhWorkflowUuid,
      webhookUrl,
    },
  };
}

export const createAgent = asyncHandler(async (req, res) => {
  if (!req.body.agentName || !req.body.agentType || !req.body.businessName) {
    throw new ApiError(400, "Agent name, type, and business name are required");
  }

  const body = sanitizeAgentBody(req.body);
  const telephonyConfigId = body.telephonyConfigId;
  delete body.telephonyConfigId;

  const agent = new Agent({
    ...body,
    userId: req.user._id,
    provider: body.provider || "custom",
    agentName: body.agentName || body.name,
    name: body.name || body.agentName,
    description: body.description || body.businessDescription,
    publicTitle: body.publicTitle || body.businessName || body.agentName || body.name,
    publicDescription: body.publicDescription || body.businessDescription || body.description,
    publicWelcomeMessage: body.publicWelcomeMessage || body.greetingMessage || body.firstMessage
  });

  agent.publicSlug = await generateUniquePublicSlug(agent.agentName || agent.name || agent.businessName);

  if (!agent.systemPrompt) {
    agent.systemPrompt = generateSystemPrompt(agent);
  }

  agent.callerIdNumber =
    body.callerIdNumber ||
    process.env.DEFAULT_CALLER_ID_NUMBER ||
    agent.callerIdNumber;

  agent.connectedPhoneNumber =
    body.connectedPhoneNumber ||
    process.env.DEFAULT_CALLER_ID_NUMBER ||
    agent.connectedPhoneNumber;

  agent.telephonyProvider =
    body.telephonyProvider ||
    process.env.DEFAULT_TELEPHONY_PROVIDER ||
    agent.telephonyProvider ||
    "twilio";

  await agent.save();
  agent.telephonyConfigId = telephonyConfigId || null;
  await syncTelephonyConfigForAgent(agent, agent.telephonyConfigId);
  await agent.save();

  try {
    const providerResult = await syncProvider(agent, "create");
    await agent.save();

    const dograhCreated = agent.provider === "dograh" && Boolean(agent.dograhWorkflowUuid);

    return res.status(201).json({
      agent,
      providerResult,
      dograhCreated,
      dograhResponse: providerResult.raw,
      warning:
        agent.provider === "dograh" && !agent.dograhWorkflowUuid
          ? "Dograh workflow created but workflow UUID was not found in response."
          : null
    });
  } catch (error) {
    if (agent.provider === "dograh") {
      agent.dograhStatus = "failed";
      agent.dograhError = error.message;
      agent.dograhNeedsUpdate = true;
    }
    agent.status = "draft";
    await agent.save();

    return res.status(201).json({
      agent,
      providerResult: null,
      dograhCreated: false,
      warning: `Agent created locally, but ${agent.provider} provider creation failed. ${error.message}`,
      error: error.message
    });
  }
});

export const listAgents = asyncHandler(async (req, res) => {
  const agents = await Agent.find({
    ...userFilter(req),
    status: { $ne: "archived" }
  }).sort({ createdAt: -1 });
  res.json(agents);
});

export const getAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  const [recentCalls, recentLeads] = await Promise.all([
    CallLog.find({ agentId: agent._id }).sort({ createdAt: -1 }).limit(5),
    Lead.find({ agentId: agent._id }).sort({ createdAt: -1 }).limit(5),
  ]);

  res.json({ agent, recentCalls, recentLeads });
});

export const updateAgent = asyncHandler(async (req, res) => {
  if (!req.params.id) {
    throw new ApiError(400, "agentId is required");
  }

  const agent = await getOwnedAgent(req);
  const body = sanitizeAgentBody(req.body);
  const allowedFields = [
    "agentName",
    "name",
    "description",
    "agentType",
    "businessName",
    "businessCategory",
    "businessDescription",
    "services",
    "pricing",
    "faqs",
    "policies",
    "offers",
    "additionalInfo",
    "systemPrompt",
    "greetingMessage",
    "fallbackMessage",
    "endingMessage",
    "humanTransferMessage",
    "language",
    "responseStyle",
    "callMode",
    "allowInterruption",
    "fastReplyMode",
    "leadCaptureEnabled",
    "voiceGender",
    "voiceStyle",
    "voiceProvider",
    "voiceId",
    "llmProvider",
    "llmModel",
    "sttProvider",
    "ttsProvider",
    "firstMessage",
    "voiceSpeed",
    "voice",
    "nodes",
    "workflowNodes",
    "tools",
    "settings",
    "knowledgeBaseIds",
    "telephonyConfigId",
    "provider",
    "tone",
    "speakingSpeed",
    "personality",
    "mainGoal",
    "secondaryGoal",
    "avoidInstructions",
    "confusedInstructions"
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) agent[field] = body[field];
  }

  agent.agentName = agent.agentName || agent.name;
  agent.name = agent.name || agent.agentName;
  agent.description = agent.description || agent.businessDescription;

  if (body.regeneratePrompt === true) {
    agent.systemPrompt = generateSystemPrompt(agent);
  } else if (body.systemPrompt !== undefined) {
    agent.systemPrompt = body.systemPrompt;
  }

  validateEditableAgentFields(agent);
  if (Object.prototype.hasOwnProperty.call(body, "telephonyConfigId")) {
    await syncTelephonyConfigForAgent(agent, agent.telephonyConfigId);
  }

  if (agent.provider === "dograh") {
    agent.dograhNeedsUpdate = true;
  }
  await agent.save();

  let providerResult = null;

  if (body.syncProvider === true) {
    providerResult = await syncProvider(agent, "update", {
      createIfMissing: Boolean(body.createIfMissing)
    });
  }

  res.json({
    success: true,
    message: providerResult
      ? "Agent saved locally and provider synced successfully."
      : "Agent saved locally. Sync Provider to apply changes to live calls.",
    providerResult,
    agent
  });
});

export const updateShareSettings = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);
  const allowedFields = [
    "isPublic",
    "publicChatEnabled",
    "publicWebCallEnabled",
    "publicTitle",
    "publicDescription",
    "publicWelcomeMessage"
  ];

  if (!agent.publicSlug) {
    agent.publicSlug = await generateUniquePublicSlug(agent.agentName || agent.name || agent.businessName);
  }

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) agent[field] = req.body[field];
  }

  await agent.save();

  res.json({
    success: true,
    agent
  });
});

export const previewRegeneratedPrompt = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const previewAgent = { ...agent.toObject(), ...req.body };
  const systemPrompt = generateSystemPrompt(previewAgent);

  res.json({ systemPrompt });
});

export const removeAgent = asyncHandler(async (req, res) => {
  if (!req.params.id) {
    throw new ApiError(400, "Agent ID is required");
  }

  const agent = await getOwnedAgent(req);

  console.log("Archiving agent with provider sync:", {
    agentId: agent._id.toString(),
    provider: agent.provider,
    providerWorkflowId: agent.providerWorkflowId || agent.dograhWorkflowId || agent.workflowId
  });

  const providerResult = await syncProvider(agent, "archive");

  console.log("Provider workflow archived successfully:", {
    agentId: agent._id.toString(),
    provider: agent.provider,
    providerWorkflowId: agent.providerWorkflowId
  });

  agent.status = "archived";
  agent.archivedAt = new Date();
  await agent.save();

  res.json({
    success: true,
    message: "Agent archived and provider workflow archived successfully",
    providerResult,
    agent
  });
});

export const testAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const { message } = req.body;

  if (!message || !message.trim()) {
    throw new ApiError(400, "Message is required.");
  }

  const aiResponse = await generateAgentTextReply({
    systemPrompt: agent.systemPrompt,
    message,
    agent,
  });

  res.json({
    success: true,
    message,
    response: aiResponse,
  });
});

export const testChatAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const { message, conversationId } = req.body;

  if (!message || !message.trim()) {
    throw new ApiError(400, "Message is required.");
  }

  const reply = await runCustomAgent({
    systemPrompt: agent.systemPrompt,
    userMessage: message,
    conversationId: conversationId || `agent:${agent._id.toString()}:test-chat`,
    tools: agent.tools,
    settings: agent.settings,
    agent
  });

  res.json({
    success: true,
    reply,
    response: reply
  });
});

export const publishAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  if (!agent.agentName || !agent.businessName || !agent.systemPrompt) {
    throw new ApiError(400, "Agent is missing required fields");
  }

  agent.status = "Active";
  agent.shareableLink = `${process.env.CLIENT_URL}/test/${agent._id}`;
  agent.embedCode = `<script src="${process.env.CLIENT_URL}/widget.js" data-agent-id="${agent._id}"></script>`;

  await agent.save();

  res.json(agent);
});

export const pauseAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  agent.status = "Paused";
  await agent.save();

  res.json(agent);
});

export const connectDograhWorkflow = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  const {
    dograhWorkflowId,
    dograhWorkflowUuid,
    dograhWorkflowName,
    connectedPhoneNumber,
    callerIdNumber,
    telephonyProvider,
  } = req.body;

  if (!dograhWorkflowId || !dograhWorkflowUuid) {
    throw new ApiError(
      400,
      "Dograh workflow ID and workflow UUID are required"
    );
  }

  assertE164(connectedPhoneNumber, "Connected phone number");
  assertE164(callerIdNumber, "Caller ID number");

  agent.dograhWorkflowId = dograhWorkflowId;
  agent.provider = "dograh";
  agent.providerWorkflowId = dograhWorkflowId;
  agent.dograhWorkflowUuid = dograhWorkflowUuid;
  agent.dograhWorkflowName = dograhWorkflowName;
  agent.connectedPhoneNumber = connectedPhoneNumber;
  agent.callerIdNumber = callerIdNumber;
  agent.telephonyProvider = telephonyProvider || "twilio";
  agent.dograhStatus = "connected";
  agent.dograhNeedsUpdate = false;
  agent.status = "Connected";

  await agent.save();

  res.json(agent);
});

export const createDograhAgentEmbedToken = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);
  const workflowId = getAgentDograhWorkflowId(agent);

  if (!workflowId) {
    throw new ApiError(400, "dograhWorkflowId is required before enabling Dograh web calling.");
  }

  const { embedToken } = await createDograhEmbedToken(workflowId);
  agent.dograhEmbedToken = embedToken;
  agent.dograhWidgetEnabled = true;
  await agent.save();

  res.json({
    success: true,
    embedToken,
    agent
  });
});

export const getDograhAgentEmbedToken = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);

  res.json({
    success: true,
    embedToken: agent.dograhEmbedToken || null,
    dograhWidgetEnabled: Boolean(agent.dograhWidgetEnabled && agent.dograhEmbedToken)
  });
});

export const deleteDograhAgentEmbedToken = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgentById(req, req.params.agentId);
  const workflowId = getAgentDograhWorkflowId(agent);

  if (!workflowId) {
    throw new ApiError(400, "dograhWorkflowId is required before disabling Dograh web calling.");
  }

  await deleteDograhEmbedToken(workflowId);
  agent.dograhEmbedToken = undefined;
  agent.dograhWidgetEnabled = false;
  await agent.save();

  res.json({
    success: true,
    embedToken: null,
    agent
  });
});

export const createDograhWorkflowForAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  if (!agent.systemPrompt) {
    agent.systemPrompt = generateSystemPrompt(agent);
  }

  agent.provider = "dograh";
  agent.callerIdNumber =
    agent.callerIdNumber ||
    process.env.DEFAULT_CALLER_ID_NUMBER;

  agent.connectedPhoneNumber =
    agent.connectedPhoneNumber ||
    process.env.DEFAULT_CALLER_ID_NUMBER;

  agent.telephonyProvider =
    agent.telephonyProvider ||
    process.env.DEFAULT_TELEPHONY_PROVIDER ||
    "twilio";
  await agent.save();

  try {
    const providerResult = await syncProvider(agent, "update", { createIfMissing: true });

    return res.json({
      agent,
      dograhCreated: Boolean(agent.dograhWorkflowUuid),
      providerResult,
      dograhResponse: providerResult.raw,
      warning: agent.dograhWorkflowUuid ? null : "Dograh workflow synced but workflow UUID was not found in response."
    });
  } catch (error) {
    agent.dograhStatus = "failed";
    agent.dograhError = error.message;
    agent.dograhNeedsUpdate = true;
    agent.status = "Draft";
    await agent.save();

    return res.status(502).json({
      agent,
      dograhCreated: false,
      error: error.message
    });
  }
});

export const updateDograhWorkflowForAgent = asyncHandler(async (req, res) => {
  if (!req.params.id) {
    throw new ApiError(400, "agentId is required");
  }

  const agent = await getOwnedAgent(req);
  agent.provider = "dograh";
  agent.providerWorkflowId = agent.providerWorkflowId || agent.dograhWorkflowId || agent.workflowId;
  const workflowId = agent.providerWorkflowId;

  if (!workflowId) {
    throw new ApiError(400, "Cannot update Dograh workflow because this agent has no existing workflow ID.");
  }

  if (!agent.systemPrompt || !agent.systemPrompt.trim()) {
    agent.systemPrompt = generateSystemPrompt(agent);
  }
  agent.callerIdNumber = agent.callerIdNumber || process.env.DEFAULT_CALLER_ID_NUMBER;
  agent.connectedPhoneNumber = agent.connectedPhoneNumber || process.env.DEFAULT_CALLER_ID_NUMBER;
  agent.telephonyProvider = agent.telephonyProvider || process.env.DEFAULT_TELEPHONY_PROVIDER || "twilio";
  await agent.save();

  try {
    console.log("[Provider Sync]", {
      agentId: agent._id.toString(),
      provider: "dograh",
      providerWorkflowId: workflowId,
      action: "update"
    });

    const providerResult = await syncProvider(agent, "update");

    res.json({
      agent,
      dograhUpdated: Boolean(agent.dograhWorkflowUuid),
      providerResult,
      dograhResponse: providerResult.raw,
      success: true,
      message: "Dograh workflow updated successfully",
      workflowId,
      warning: agent.dograhWorkflowUuid ? null : "Dograh workflow updated but workflow UUID was not found in response."
    });
  } catch (error) {
    agent.dograhStatus = "update_failed";
    agent.dograhError = error.message;
    agent.dograhNeedsUpdate = true;
    await agent.save();

    res.status(502).json({
      agent,
      dograhUpdated: false,
      error: error.message
    });
  }
});

export const syncProviderForAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  if (!agent.systemPrompt || !agent.systemPrompt.trim()) {
    agent.systemPrompt = generateSystemPrompt(agent);
    await agent.save();
  }

  const providerWorkflowId = agent.providerWorkflowId || agent.dograhWorkflowId || agent.workflowId;
  const createIfMissing = Boolean(req.body?.createIfMissing);

  if (agent.provider !== "custom" && !providerWorkflowId && !createIfMissing) {
    throw new ApiError(
      400,
      "Provider workflow ID missing. Enable createIfMissing to create a new provider workflow."
    );
  }

  const providerResult = await syncProvider(agent, "update", { createIfMissing });

  res.json({
    success: true,
    message: "Provider synced successfully",
    providerResult,
    agent
  });
});

async function triggerCall(req, res, trigger) {
  if (!process.env.DOGRAH_BASE_URL) {
    throw new ApiError(
      500,
      "DOGRAH_BASE_URL is missing. Please configure the backend environment."
    );
  }

  if (!process.env.DOGRAH_API_KEY) {
    throw new ApiError(
      500,
      "DOGRAH_API_KEY is missing. Please configure the backend environment."
    );
  }

  const agent = await getOwnedAgent(req);
  const { phoneNumber } = req.body;

  if (!agent.dograhWorkflowUuid) {
    throw new ApiError(
      400,
      "workflowUuid is required. Connect a Dograh workflow before triggering calls."
    );
  }

  if (!phoneNumber) {
    throw new ApiError(
      400,
      "phoneNumber is required before triggering a Dograh call."
    );
  }

  if (!agent.callerIdNumber) {
    throw new ApiError(
      400,
      "callerIdNumber is required. Connect a Dograh workflow with a caller ID number."
    );
  }

  assertE164(phoneNumber, "Phone number");
  assertE164(agent.callerIdNumber, "Caller ID number");

  const payload = dograhCallPayload(agent, phoneNumber);
  const dograhResponse = await trigger(agent.dograhWorkflowUuid, payload);
  const dograhRunId = extractRunId(dograhResponse);
  const responseFields = extractCallFields(dograhResponse);

  console.log("Dograh trigger response:", JSON.stringify(dograhResponse, null, 2));
  console.log("Auto extracted dograhRunId:", dograhRunId);
  if (!dograhRunId) {
    console.warn("Dograh run ID missing in trigger response. CallLog will be created, but manual sync needs a run ID.");
  }

  const callLog = await CallLog.create({
    userId: req.user._id,
    agentId: agent._id,
    dograhWorkflowId: agent.dograhWorkflowId,
    dograhWorkflowUuid: agent.dograhWorkflowUuid,
    dograhRunId: dograhRunId ? String(dograhRunId) : null,
    callerNumber: phoneNumber,
    callingNumber: agent.callerIdNumber,
    status: dograhResponse?.status || dograhResponse?.data?.status || "initiated",
    callDirection: "outbound",
    source: "dograh",
    duration: null,
    durationSeconds: null,
    summary: null,
    transcript: null,
    rawDograhPayload: dograhResponse,
    startedAt: responseFields.startedAt || new Date(),
  });

  console.log("Dograh call triggered:", {
    localAgentId: agent._id.toString(),
    dograhWorkflowUuid: agent.dograhWorkflowUuid,
    dograhRunId,
    callerNumber: phoneNumber,
    callingNumber: agent.callerIdNumber
  });

  res.status(202).json({ dograhResponse, callLog });
}

export const triggerTestCall = asyncHandler(async (req, res) => {
  await triggerCall(req, res, triggerDograhTestCallByWorkflow);
});

export const triggerOutboundCall = asyncHandler(async (req, res) => {
  await triggerCall(req, res, triggerDograhOutboundCallByWorkflow);
});

export const listAgentCalls = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  const calls = await CallLog.find({
    agentId: agent._id,
    userId: agent.userId,
  }).sort({ createdAt: -1 });

  res.json(calls);
});
