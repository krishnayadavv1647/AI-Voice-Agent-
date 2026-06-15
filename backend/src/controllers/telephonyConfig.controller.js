import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import TelephonyConfig from "../models/TelephonyConfig.js";
import { runCustomAgent } from "../services/customAgentRuntime.js";
import { addDograhTelephonyPhoneNumber, createDograhTelephonyConfiguration } from "../services/dograh.service.js";
import { getDograhClientForUser } from "../services/dograhClientResolver.js";
import { assertRuntimeVerification, verifyDograhWorkflowRuntime } from "../services/dograhWorkflowConfig.service.js";
import { getTelephonyProvider } from "../telephony/index.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { decryptSecret, encryptSecret } from "../utils/secretCrypto.js";

const SECRET_FIELDS = ["authToken", "apiSecret"];
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const DEFAULT_INCOMING_MESSAGE = "Hello, how can I help you?";
const MISSING_AGENT_MESSAGE = "Sorry, agent is not configured.";
const INCOMING_LOOKUP_TIMEOUT_MS = 1500;
const INBOUND_MODES = ["dograh_ai", "static_greeting", "disabled"];

function userFilter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
}

function publicBaseUrl() {
  const baseUrl = process.env.PUBLIC_BACKEND_URL?.trim().replace(/\/$/, "");

  if (!baseUrl) {
    throw new ApiError(
      500,
      "PUBLIC_BACKEND_URL is missing. Set it to your deployed backend URL."
    );
  }

  if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
    throw new ApiError(
      500,
      "PUBLIC_BACKEND_URL must be a deployed public backend URL, not localhost."
    );
  }

  return baseUrl;
}

function buildWebhookUrl(req, provider) {
  const webhookUrl = `${publicBaseUrl()}/api/telephony/${provider}/incoming`;

  if (!webhookUrl.startsWith("https://") || webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    throw new ApiError(
      500,
      "Generated webhook URL must use your deployed HTTPS backend, not localhost."
    );
  }

  if (provider === "twilio") {
    console.log("Generated Twilio webhook URL:", webhookUrl);
  }

  return webhookUrl;
}

function maskPhone(value) {
  const text = String(value || "");
  if (text.length <= 5) return text ? "****" : "";
  return `${text.slice(0, 3)}****${text.slice(-2)}`;
}

function configuredDograhBaseHost() {
  try {
    return new URL(process.env.DOGRAH_BASE_URL || "").host.toLowerCase();
  } catch {
    return "";
  }
}

function isPrivateHostname(hostname) {
  const host = String(hostname || "").toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "169.254.169.254" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function validateDograhInboundWebhookUrl(value) {
  if (!value) return "";
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new ApiError(400, "Dograh inbound webhook URL is invalid.", { code: "INBOUND_RUNTIME_NOT_READY" });
  }

  if (url.protocol !== "https:" || isPrivateHostname(url.hostname)) {
    throw new ApiError(400, "Dograh inbound webhook URL is not allowed.", { code: "INBOUND_RUNTIME_NOT_READY" });
  }

  const allowedHosts = [
    configuredDograhBaseHost(),
    process.env.DOGRAH_INBOUND_WEBHOOK_HOST?.trim().toLowerCase()
  ].filter(Boolean);
  if (allowedHosts.length && !allowedHosts.includes(url.host.toLowerCase())) {
    throw new ApiError(400, "Dograh inbound webhook URL host is not approved.", { code: "INBOUND_RUNTIME_NOT_READY" });
  }

  return url.toString();
}

function extractDograhInboundWebhookUrl(...payloads) {
  const keys = new Set([
    "dograh_inbound_webhook_url",
    "dograhInboundWebhookUrl",
    "inbound_webhook_url",
    "inboundWebhookUrl",
    "webhook_url",
    "webhookUrl",
    "voice_url",
    "voiceUrl"
  ]);
  const seen = new Set();

  function visit(value) {
    if (!value || typeof value !== "object" || seen.has(value)) return "";
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const result = visit(item);
        if (result) return result;
      }
      return "";
    }
    for (const [key, child] of Object.entries(value)) {
      if (keys.has(key) && typeof child === "string" && child.trim()) return child.trim();
      const result = visit(child);
      if (result) return result;
    }
    return "";
  }

  for (const payload of payloads) {
    const result = visit(payload);
    if (result) return result;
  }
  return "";
}

function mask(value) {
  const unsealed = decryptSecret(value);
  if (!unsealed) return "";
  const text = String(unsealed);
  return text.length <= 5 ? "*****" : `${text.slice(0, 3)}*****${text.slice(-2)}`;
}

function isMaskedSecret(value) {
  return typeof value === "string" && value.includes("*****");
}

function cleanOptionalObjectId(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!String(value).trim()) return null;
  if (!TelephonyConfig.db.base.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `${fieldName} is not valid`);
  }
  return value;
}

function cleanRequiredObjectId(value, fieldName) {
  const cleaned = cleanOptionalObjectId(value, fieldName);
  if (!cleaned) throw new ApiError(400, `${fieldName} is required`);
  return cleaned;
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return Boolean(value);
}

function maskWebhookForDisplay(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}${url.search ? "?..." : ""}`;
  } catch {
    return "";
  }
}

function cleanInboundMode(value, inboundEnabled = true) {
  if (inboundEnabled === false) return "disabled";
  const mode = value || "dograh_ai";
  if (!INBOUND_MODES.includes(mode)) {
    throw new ApiError(400, "Inbound call mode is not valid");
  }
  return mode;
}

function sanitizeConfig(config) {
  const item = config.toObject ? config.toObject() : { ...config };
  for (const field of SECRET_FIELDS) {
    if (item[field]) item[field] = mask(item[field]);
  }
  item.dograhInboundWebhookConfigured = Boolean(item.dograhInboundWebhookUrl);
  if (item.dograhInboundWebhookUrl) item.dograhInboundWebhookUrl = maskWebhookForDisplay(item.dograhInboundWebhookUrl);
  if (item.webhookUrl) item.webhookUrl = maskWebhookForDisplay(item.webhookUrl);
  if (item.twilioVoiceUrl) item.twilioVoiceUrl = maskWebhookForDisplay(item.twilioVoiceUrl);
  delete item.dograhRawResponse;
  return item;
}

function applyBody(config, body, req) {
  const allowedFields = [
    "name",
    "provider",
    "phoneNumber",
    "accountSid",
    "authToken",
    "apiKey",
    "apiSecret",
    "appId",
    "region",
    "country",
    "webhookUrl",
    "linkedAgentId",
    "inboundEnabled",
    "inboundMode",
    "outboundEnabled",
    "status"
  ];

  for (const field of allowedFields) {
    if (body[field] === undefined) continue;
    if (SECRET_FIELDS.includes(field) && isMaskedSecret(body[field])) continue;
    if (field === "linkedAgentId") {
      config[field] = cleanOptionalObjectId(body[field], "linkedAgentId");
      continue;
    }
    config[field] = SECRET_FIELDS.includes(field) ? encryptSecret(body[field]) : body[field];
  }

  config.inboundMode = cleanInboundMode(config.inboundMode, config.inboundEnabled);
  if (config.inboundMode !== "dograh_ai") {
    config.webhookUrl = buildWebhookUrl(req, config.provider);
  }
}

function buildDograhProviderConfig(body) {
  const config = {
    provider: body.provider
  };

  const mappings = [
    ["accountSid", "account_sid"],
    ["authToken", "auth_token"],
    ["apiKey", "api_key"],
    ["apiSecret", "api_secret"],
    ["appId", "app_id"],
    ["region", "region"],
    ["country", "country"]
  ];

  for (const [source, target] of mappings) {
    if (body[source]) config[target] = body[source];
  }

  if (body.phoneNumber) config.from_numbers = [body.phoneNumber];

  return config;
}

function buildDograhTelephonyConfigPayload(body) {
  return {
    name: body.name,
    config: buildDograhProviderConfig(body)
  };
}

function dograhWorkflowIdForInbound(agent) {
  const value = agent.providerWorkflowId || agent.dograhWorkflowId;
  if (!value) return null;

  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function buildDograhPhonePayload({ body, agent, inboundEnabled, outboundEnabled }) {
  const inboundWorkflowId = inboundEnabled ? dograhWorkflowIdForInbound(agent) : null;

  if (inboundEnabled && !inboundWorkflowId) {
    throw new ApiError(400, "Inbound calling requires the linked agent to have a numeric Dograh workflow ID. Sync the agent with Dograh first, or disable inbound for this number.");
  }

  return {
    address: body.phoneNumber,
    country_code: body.country || null,
    label: body.name || body.phoneNumber,
    inbound_workflow_id: inboundWorkflowId,
    is_active: true,
    is_default_caller_id: outboundEnabled,
    extra_metadata: {
      localAgentId: agent._id.toString(),
      inboundEnabled,
      outboundEnabled
    }
  };
}

async function assertLinkedAgentRuntimeReady(agent, userId, callType) {
  if (!agent.dograhWorkflowUuid) {
    throw new ApiError(400, "Linked agent is missing Dograh workflow UUID. Sync the agent before attaching phone calls.");
  }
  if (agent.workflowSyncStatus && agent.workflowSyncStatus !== "synced") {
    throw new ApiError(400, agent.workflowSyncError || "Linked agent Dograh runtime sync is not complete.");
  }

  const workflowId = agent.dograhWorkflowId || agent.providerWorkflowId;
  if (!workflowId) {
    throw new ApiError(400, "Linked agent is missing Dograh workflow ID. Sync the agent before attaching phone calls.");
  }

  const resolved = await getDograhClientForUser(userId, { allowGlobalFallbackOnError: false });
  const verification = await verifyDograhWorkflowRuntime({
    agent,
    userId,
    callType,
    fetchWorkflow: async () => {
      const response = await resolved.client.get(`/workflow/fetch/${encodeURIComponent(workflowId)}`);
      return response.data;
    }
  });
  assertRuntimeVerification(verification);
}

async function verifyInboundRuntimeReady({ config, agent, userId }) {
  if (!config || !agent) {
    throw new ApiError(400, "The agent is not ready for inbound AI calls.", {
      code: "INBOUND_RUNTIME_NOT_READY"
    });
  }

  if (config.inboundMode !== "dograh_ai") {
    return { mode: config.inboundMode, routingStatus: config.inboundRoutingStatus || "not_configured" };
  }

  try {
    if (!config.inboundEnabled) {
      throw new Error("Inbound calling is disabled.");
    }
    await assertLinkedAgentRuntimeReady(agent, userId, "inbound_phone_call");
    if (!config.dograhTelephonyConfigId || !config.dograhPhoneNumberId) {
      throw new Error("Dograh telephony configuration is missing.");
    }
    if (!config.dograhWorkflowId || !config.dograhWorkflowUuid) {
      throw new Error("Dograh workflow mapping is missing.");
    }
    if (String(config.dograhWorkflowUuid) !== String(agent.dograhWorkflowUuid)) {
      throw new Error("Phone number is mapped to another Dograh workflow.");
    }
    if (config.dograhInboundWebhookUrl) {
      validateDograhInboundWebhookUrl(config.dograhInboundWebhookUrl);
    }
  } catch (error) {
    throw new ApiError(400, "The agent is not ready for inbound AI calls.", {
      code: "INBOUND_RUNTIME_NOT_READY",
      reason: error.message
    });
  }

  return {
    mode: config.inboundMode,
    routingStatus: config.dograhInboundWebhookUrl ? "verified" : "dograh_managed"
  };
}

async function syncLinkedAgent(config) {
  await Agent.updateMany({ telephonyConfigId: config._id }, { $set: { telephonyConfigId: null } });
  if (!config.linkedAgentId) return;

  const agent = await Agent.findOne({ _id: config.linkedAgentId, userId: config.userId });
  if (!agent) throw new ApiError(400, "Linked agent was not found for this user");

  await TelephonyConfig.updateMany(
    { userId: config.userId, linkedAgentId: agent._id, _id: { $ne: config._id } },
    { $set: { linkedAgentId: null } }
  );

  agent.telephonyConfigId = config._id;
  agent.telephonyProvider = config.provider;
  agent.connectedPhoneNumber = config.phoneNumber;
  await agent.save();
}

async function getOwnedConfig(req) {
  const config = await TelephonyConfig.findOne({
    _id: req.params.id,
    ...userFilter(req)
  });

  if (!config) throw new ApiError(404, "Telephony config not found");
  return config;
}

export const listTelephonyConfigs = asyncHandler(async (req, res) => {
  const configs = await TelephonyConfig.find(userFilter(req)).sort({ createdAt: -1 });
  res.json(configs.map(sanitizeConfig));
});

export const createTelephonyConfig = asyncHandler(async (req, res) => {
  if (!req.body.name || !req.body.provider || !req.body.phoneNumber) {
    throw new ApiError(400, "Name, provider, and phone number are required");
  }

  if (!E164_PATTERN.test(req.body.phoneNumber)) {
    throw new ApiError(400, "Phone number must be in E.164 format, for example +17578297060");
  }

  const linkedAgentId = cleanRequiredObjectId(req.body.linkedAgentId, "linkedAgentId");
  const linkedAgent = await Agent.findOne({ _id: linkedAgentId, ...userFilter(req) });
  if (!linkedAgent) throw new ApiError(400, "Linked agent was not found for this user");

  const inboundEnabled = booleanValue(req.body.inboundEnabled, true);
  const outboundEnabled = booleanValue(req.body.outboundEnabled, true);
  const inboundMode = cleanInboundMode(req.body.inboundMode, inboundEnabled);
  if (!inboundEnabled && !outboundEnabled) {
    throw new ApiError(400, "Enable inbound, outbound, or both for this telephony configuration");
  }

  const provider = getTelephonyProvider(req.body.provider);
  const config = new TelephonyConfig({ userId: req.user._id });
  applyBody(config, { ...req.body, linkedAgentId, inboundEnabled, inboundMode, outboundEnabled, status: "active" }, req);
  provider.saveConfig(config);
  if (inboundMode === "dograh_ai" || outboundEnabled) {
    await assertLinkedAgentRuntimeReady(linkedAgent, req.user._id, inboundMode === "dograh_ai" ? "inbound_phone_call" : "outbound_phone_call");
  }

  const dograhConfigPayload = buildDograhTelephonyConfigPayload(req.body);
  const dograhPhonePayload = buildDograhPhonePayload({ body: req.body, agent: linkedAgent, inboundEnabled, outboundEnabled });
  const dograhConfig = await createDograhTelephonyConfiguration(dograhConfigPayload, { userId: req.user._id });
  const dograhPhone = await addDograhTelephonyPhoneNumber(dograhConfig.dograhTelephonyConfigId, dograhPhonePayload, { userId: req.user._id });

  config.dograhTelephonyConfigId = String(dograhConfig.dograhTelephonyConfigId);
  config.dograhPhoneNumberId = dograhPhone.dograhPhoneNumberId ? String(dograhPhone.dograhPhoneNumberId) : "";
  config.dograhWorkflowId = linkedAgent.dograhWorkflowId || linkedAgent.providerWorkflowId || "";
  config.dograhWorkflowUuid = linkedAgent.dograhWorkflowUuid || "";
  const dograhWebhookUrl = extractDograhInboundWebhookUrl(dograhPhone.raw, dograhPhone.providerSync, dograhConfig.raw);
  config.dograhInboundWebhookUrl = dograhWebhookUrl ? validateDograhInboundWebhookUrl(dograhWebhookUrl) : "";
  config.webhookUrl = inboundMode === "dograh_ai" && config.dograhInboundWebhookUrl
    ? config.dograhInboundWebhookUrl
    : buildWebhookUrl(req, config.provider);
  config.inboundRoutingStatus = inboundMode === "dograh_ai"
    ? (config.dograhInboundWebhookUrl ? "verified" : "dograh_managed")
    : inboundMode === "static_greeting" ? "verified" : "not_configured";
  config.inboundRoutingError = "";
  config.inboundRoutingVerifiedAt = inboundMode === "dograh_ai" ? new Date() : null;
  config.dograhProviderSync = dograhPhone.providerSync;
  config.dograhRawResponse = {
    telephonyConfiguration: dograhConfig.raw,
    phoneNumber: dograhPhone.raw
  };

  try {
    await config.save();
  } catch (error) {
    console.error("Dograh telephony configuration was created, but local TelephonyConfig save failed:", {
      linkedAgentId: linkedAgentId?.toString(),
      dograhTelephonyConfigId: config.dograhTelephonyConfigId,
      dograhPhoneNumberId: config.dograhPhoneNumberId,
      error: error.message
    });
    throw error;
  }

  try {
    await syncLinkedAgent(config);
  } catch (error) {
    console.error("Local TelephonyConfig saved after Dograh creation, but linked Agent update failed:", {
      telephonyConfigId: config._id?.toString(),
      linkedAgentId: linkedAgentId?.toString(),
      dograhTelephonyConfigId: config.dograhTelephonyConfigId,
      error: error.message
    });
    throw error;
  }

  res.status(201).json(sanitizeConfig(config));
});

export const updateTelephonyConfig = asyncHandler(async (req, res) => {
  const config = await getOwnedConfig(req);
  applyBody(config, req.body, req);
  const provider = getTelephonyProvider(config.provider);
  provider.saveConfig(config);
  if (config.linkedAgentId && (config.inboundEnabled || config.outboundEnabled)) {
    const linkedAgent = await Agent.findOne({ _id: config.linkedAgentId, userId: config.userId });
    if (!linkedAgent) throw new ApiError(400, "Linked agent was not found for this user");
    if (config.inboundMode === "dograh_ai" || config.outboundEnabled) {
      await assertLinkedAgentRuntimeReady(linkedAgent, config.userId, config.inboundMode === "dograh_ai" ? "inbound_phone_call" : "outbound_phone_call");
    }
    config.dograhWorkflowId = linkedAgent.dograhWorkflowId || linkedAgent.providerWorkflowId || config.dograhWorkflowId || "";
    config.dograhWorkflowUuid = linkedAgent.dograhWorkflowUuid || config.dograhWorkflowUuid || "";
  }
  if (config.inboundMode !== "dograh_ai") {
    config.inboundRoutingStatus = config.inboundMode === "static_greeting" ? "verified" : "not_configured";
    config.inboundRoutingError = "";
    config.webhookUrl = buildWebhookUrl(req, config.provider);
  }
  await config.save();
  await syncLinkedAgent(config);

  res.json(sanitizeConfig(config));
});

export const deleteTelephonyConfig = asyncHandler(async (req, res) => {
  const config = await getOwnedConfig(req);
  await Agent.updateMany({ telephonyConfigId: config._id }, { $set: { telephonyConfigId: null } });
  await config.deleteOne();
  res.json({ success: true, message: "Telephony config deleted" });
});

export const testTelephonyConfig = asyncHandler(async (req, res) => {
  const config = await getOwnedConfig(req);
  const provider = getTelephonyProvider(config.provider);
  const result = await provider.testConnection(config);
  res.json({ success: true, result });
});

export const configureTelephonyWebhook = asyncHandler(async (req, res) => {
  const config = await getOwnedConfig(req);
  const provider = getTelephonyProvider(config.provider);
  const linkedAgent = config.linkedAgentId
    ? await Agent.findOne({ _id: config.linkedAgentId, userId: config.userId })
    : null;

  if (config.inboundMode === "dograh_ai") {
    await verifyInboundRuntimeReady({ config, agent: linkedAgent, userId: config.userId });
    if (!config.dograhInboundWebhookUrl) {
      config.inboundRoutingStatus = "dograh_managed";
      config.inboundRoutingError = "Dograh did not return a direct inbound webhook URL. The number must be managed by Dograh telephony assignment.";
      await config.save();
      throw new ApiError(400, "Dograh did not return a direct inbound webhook URL for this number. Verify the Dograh telephony phone-number assignment instead.", {
        code: "INBOUND_RUNTIME_NOT_READY"
      });
    }
    config.webhookUrl = validateDograhInboundWebhookUrl(config.dograhInboundWebhookUrl);
  } else {
    config.webhookUrl = buildWebhookUrl(req, config.provider);
  }
  config.webhookMethod = "POST";
  await config.save();

  const result = await provider.configureWebhook(config);
  config.twilioVoiceUrl = result.voiceUrl || config.webhookUrl;
  config.twilioVoiceMethod = result.voiceMethod || "POST";
  config.inboundRoutingStatus = "verified";
  config.inboundRoutingError = "";
  config.inboundRoutingVerifiedAt = new Date();
  await config.save();
  res.json({ success: true, webhookUrl: config.webhookUrl, result });
});

export const verifyInboundRouting = asyncHandler(async (req, res) => {
  const config = await getOwnedConfig(req);
  const agent = config.linkedAgentId
    ? await Agent.findOne({ _id: config.linkedAgentId, userId: config.userId })
    : null;
  const provider = getTelephonyProvider(config.provider);

  try {
    const runtime = await verifyInboundRuntimeReady({ config, agent, userId: config.userId });
    let providerWebhook = null;
    if (typeof provider.getWebhookConfig === "function") {
      providerWebhook = await provider.getWebhookConfig(config);
      config.twilioVoiceUrl = providerWebhook.voiceUrl || "";
      config.twilioVoiceMethod = providerWebhook.voiceMethod || "";
      if (config.inboundMode === "dograh_ai" && config.dograhInboundWebhookUrl) {
        const expected = validateDograhInboundWebhookUrl(config.dograhInboundWebhookUrl);
        if (providerWebhook.voiceUrl !== expected) {
          throw new Error("Twilio Voice URL is not routed to Dograh.");
        }
      }
    }

    config.inboundRoutingStatus = runtime.routingStatus;
    config.inboundRoutingError = "";
    config.inboundRoutingVerifiedAt = new Date();
    await config.save();

    res.json({
      success: true,
      code: "INBOUND_ROUTING_VERIFIED",
      mode: config.inboundMode,
      dograhWorkflowId: config.dograhWorkflowId,
      dograhWorkflowUuid: config.dograhWorkflowUuid,
      dograhInboundWebhookConfigured: Boolean(config.dograhInboundWebhookUrl),
      twilioVoiceUrlConfigured: Boolean(providerWebhook?.voiceUrl),
      routingStatus: config.inboundRoutingStatus,
      runtime
    });
  } catch (error) {
    config.inboundRoutingStatus = "failed";
    config.inboundRoutingError = error.message;
    await config.save();
    throw new ApiError(400, "The agent is not ready for inbound AI calls.", {
      code: "INBOUND_RUNTIME_NOT_READY",
      message: "The agent is not ready for inbound AI calls."
    });
  }
});

function getIncomingNumber(req) {
  return (
    req.body?.To ||
    req.body?.Called ||
    req.body?.to ||
    req.body?.msisdn ||
    req.query?.To ||
    req.query?.Called ||
    req.query?.to ||
    req.query?.msisdn
  );
}

function getCallerNumber(req) {
  return (
    req.body?.From ||
    req.body?.Caller ||
    req.body?.from ||
    req.body?.caller ||
    req.query?.From ||
    req.query?.Caller ||
    req.query?.from ||
    req.query?.caller
  );
}

function normalizePhone(value) {
  return value ? String(value).replace(/[^\d+]/g, "") : value;
}

async function findConfigForIncoming(providerName, phoneNumber) {
  const normalized = normalizePhone(phoneNumber);
  return TelephonyConfig.findOne({
    provider: providerName,
    status: "active",
    $or: [{ phoneNumber }, { phoneNumber: normalized }, { phoneNumber: normalized?.replace(/^\+/, "") }]
  });
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function logIncomingCallEvent(label, details = {}) {
  console.log(`[Telephony Incoming] ${label}`, details);
}

function buildFallbackVoiceResponse(providerName, message = MISSING_AGENT_MESSAGE) {
  const provider = getTelephonyProvider(providerName);
  return provider.handleIncomingCall({ reply: message, agent: null });
}

function sendVoiceResponse(res, response) {
  if (response.contentType) res.type(response.contentType);
  return res.status(200).send(response.body);
}

function recordInboundCallInBackground({ providerName, phoneNumber, callerNumber, config, agent, req }) {
  Promise.resolve().then(async () => {
    if (!config || !agent) return;

    const userMessage = `Incoming phone call from ${callerNumber || "unknown caller"} to ${phoneNumber || config.phoneNumber}.`;
    let reply = agent.firstMessage || agent.greetingMessage || DEFAULT_INCOMING_MESSAGE;

    if (config.inboundMode !== "static_greeting") {
      try {
        reply = await runCustomAgent({
          systemPrompt: agent.systemPrompt,
          userMessage,
          tools: agent.tools,
          settings: agent.settings,
          agent
        });
      } catch (error) {
        console.error("[Telephony Incoming] Agent runtime failed after voice response", {
          provider: providerName,
          incomingNumberMasked: maskPhone(phoneNumber),
          agentId: agent._id?.toString(),
          error: error.message
        });
      }
    }

    await CallLog.create({
      userId: agent.userId,
      agentId: agent._id,
      callerNumber,
      callingNumber: phoneNumber || config.phoneNumber,
      callDirection: "inbound",
      source: providerName,
      transcript: `Caller: ${userMessage}\nAgent: ${reply}`,
      status: config.inboundMode === "static_greeting" ? "completed" : "answered",
      rawWebhookPayload: { body: req.body, query: req.query },
      startedAt: new Date()
    });
  }).catch((error) => {
    console.error("[Telephony Incoming] Background call logging failed", {
      provider: providerName,
      incomingNumberMasked: maskPhone(phoneNumber),
      error: error.message
    });
  });
}

export const handleIncomingTelephony = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const providerName = req.params.provider;
  const phoneNumber = getIncomingNumber(req);
  const callerNumber = getCallerNumber(req);

  logIncomingCallEvent("incoming call received", {
    provider: providerName,
    incomingNumberMasked: maskPhone(phoneNumber),
    callerNumberMasked: maskPhone(callerNumber)
  });

  try {
    const provider = getTelephonyProvider(providerName);
    let config = null;
    let agent = null;

    if (phoneNumber) {
      config = await withTimeout(
        findConfigForIncoming(providerName, phoneNumber),
        INCOMING_LOOKUP_TIMEOUT_MS,
        "Telephony config lookup"
      );
    }

    logIncomingCallEvent("telephony config found", {
      provider: providerName,
      incomingNumberMasked: maskPhone(phoneNumber),
      found: Boolean(config),
      configId: config?._id?.toString()
    });

    if (config) {
      agent =
        (config.linkedAgentId && await withTimeout(
          Agent.findOne({ _id: config.linkedAgentId, status: { $ne: "archived" } }),
          INCOMING_LOOKUP_TIMEOUT_MS,
          "Linked agent lookup"
        )) ||
        await withTimeout(
          Agent.findOne({ telephonyConfigId: config._id, status: { $ne: "archived" } }),
          INCOMING_LOOKUP_TIMEOUT_MS,
          "Telephony agent lookup"
        );
    }

    logIncomingCallEvent("linked agent found", {
      provider: providerName,
      incomingNumberMasked: maskPhone(phoneNumber),
      found: Boolean(agent),
      agentId: agent?._id?.toString()
    });

    const reply = agent?.firstMessage || agent?.greetingMessage || (config ? MISSING_AGENT_MESSAGE : DEFAULT_INCOMING_MESSAGE);
    if (config?.inboundMode === "dograh_ai") {
      await verifyInboundRuntimeReady({ config, agent, userId: config.userId });
      await CallLog.create({
        userId: agent.userId,
        agentId: agent._id,
        callerNumber,
        callingNumber: phoneNumber || config.phoneNumber,
        dograhWorkflowId: agent.dograhWorkflowId,
        dograhWorkflowUuid: agent.dograhWorkflowUuid,
        callDirection: "inbound",
        source: providerName,
        status: config.dograhInboundWebhookUrl ? "routing_to_dograh" : "routing_failed",
        rawWebhookPayload: { body: req.body, query: req.query },
        startedAt: new Date()
      });
    }
    const response = provider.handleIncomingCall({ req, config, agent, reply });

    logIncomingCallEvent("response returned", {
      provider: providerName,
      incomingNumberMasked: maskPhone(phoneNumber),
      agentId: agent?._id?.toString(),
      dograhWorkflowId: agent?.dograhWorkflowId,
      dograhWorkflowUuid: agent?.dograhWorkflowUuid,
      inboundMode: config?.inboundMode || "unknown",
      routingStatus: config?.inboundMode === "dograh_ai" ? (config.dograhInboundWebhookUrl ? "routing_to_dograh" : "routing_failed") : "static_or_disabled",
      contentType: response.contentType,
      elapsedMs: Date.now() - startedAt
    });

    sendVoiceResponse(res, response);
    if (config?.inboundMode !== "dograh_ai") {
      recordInboundCallInBackground({ providerName, phoneNumber, callerNumber, config, agent, req });
    }
  } catch (error) {
    console.error("[Telephony Incoming] Backend error before voice response", {
      provider: providerName,
      incomingNumberMasked: maskPhone(phoneNumber),
      error: error.message
    });

    const response = buildFallbackVoiceResponse(providerName, "We are unable to connect your call right now. Please try again later.");
    logIncomingCallEvent("response returned", {
      provider: providerName,
      incomingNumberMasked: maskPhone(phoneNumber),
      contentType: response.contentType,
      fallback: true,
      elapsedMs: Date.now() - startedAt
    });

    return sendVoiceResponse(res, response);
  }
});
