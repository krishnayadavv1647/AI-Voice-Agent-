import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import TelephonyConfig from "../models/TelephonyConfig.js";
import { runCustomAgent } from "../services/customAgentRuntime.js";
import { autoGenerateLeadFromCall } from "../services/leadGeneration.service.js";
import { getTelephonyProvider } from "../telephony/index.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { decryptSecret, encryptSecret } from "../utils/secretCrypto.js";

const SECRET_FIELDS = ["authToken", "apiSecret"];
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const DEFAULT_INCOMING_MESSAGE = "Hello, how can I help you?";
const MISSING_AGENT_MESSAGE = "Sorry, agent is not configured.";
const INCOMING_LOOKUP_TIMEOUT_MS = 1500;
// "ai_agent" runs the linked agent live for the incoming call; "static_greeting" plays a fixed
// greeting; "disabled" turns inbound off. All modes route the number to this backend's webhook.
const INBOUND_MODES = ["ai_agent", "static_greeting", "disabled"];
const LEGACY_INBOUND_MODE_MAP = {
  agent_runtime: "ai_agent"
};

function userFilter(req) {
  return ["admin", "super_admin"].includes(req.user.role) ? {} : { userId: req.user._id };
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
  const mode = LEGACY_INBOUND_MODE_MAP[value] || value || "ai_agent";
  if (!INBOUND_MODES.includes(mode)) {
    throw new ApiError(400, "Inbound call mode is not valid");
  }
  return mode;
}

function sanitizeConfig(config) {
  const item = config.toObject ? config.toObject() : { ...config };
  if (item.accountSid) item.accountSid = mask(item.accountSid);
  for (const field of SECRET_FIELDS) {
    if (item[field]) item[field] = mask(item[field]);
  }
  if (item.webhookUrl) item.webhookUrl = maskWebhookForDisplay(item.webhookUrl);
  if (item.twilioVoiceUrl) item.twilioVoiceUrl = maskWebhookForDisplay(item.twilioVoiceUrl);
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
  // All inbound modes route the number to this backend's own webhook.
  config.webhookUrl = buildWebhookUrl(req, config.provider);
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

  config.inboundRoutingStatus = inboundMode === "disabled" ? "not_configured" : "verified";
  config.inboundRoutingError = "";
  config.inboundRoutingVerifiedAt = inboundMode === "disabled" ? null : new Date();

  await config.save();
  await syncLinkedAgent(config);

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
  }
  config.inboundRoutingStatus = config.inboundMode === "disabled" ? "not_configured" : "verified";
  config.inboundRoutingError = "";
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

  config.webhookUrl = buildWebhookUrl(req, config.provider);
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
    if (config.inboundMode === "ai_agent" && !agent) {
      throw new Error("Link an agent to this number for AI inbound calls.");
    }

    let providerWebhook = null;
    const expected = buildWebhookUrl(req, config.provider);
    if (typeof provider.getWebhookConfig === "function") {
      providerWebhook = await provider.getWebhookConfig(config);
      config.twilioVoiceUrl = providerWebhook.voiceUrl || "";
      config.twilioVoiceMethod = providerWebhook.voiceMethod || "";
      if (config.inboundMode !== "disabled" && providerWebhook.voiceUrl && providerWebhook.voiceUrl !== expected) {
        throw new Error("Twilio Voice URL is not routed to this backend.");
      }
    }

    config.inboundRoutingStatus = config.inboundMode === "disabled" ? "not_configured" : "verified";
    config.inboundRoutingError = "";
    config.inboundRoutingVerifiedAt = new Date();
    await config.save();

    res.json({
      success: true,
      code: "INBOUND_ROUTING_VERIFIED",
      mode: config.inboundMode,
      twilioVoiceUrlConfigured: Boolean(providerWebhook?.voiceUrl),
      routingStatus: config.inboundRoutingStatus
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

    const callLog = await CallLog.create({
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
    await autoGenerateLeadFromCall(callLog);
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
    const response = provider.handleIncomingCall({ req, config, agent, reply });

    logIncomingCallEvent("response returned", {
      provider: providerName,
      incomingNumberMasked: maskPhone(phoneNumber),
      agentId: agent?._id?.toString(),
      inboundMode: config?.inboundMode || "unknown",
      contentType: response.contentType,
      elapsedMs: Date.now() - startedAt
    });

    sendVoiceResponse(res, response);
    if (config?.inboundMode !== "disabled") {
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
