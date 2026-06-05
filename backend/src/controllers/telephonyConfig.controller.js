import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import TelephonyConfig from "../models/TelephonyConfig.js";
import { runCustomAgent } from "../services/customAgentRuntime.js";
import { addDograhTelephonyPhoneNumber, createDograhTelephonyConfiguration } from "../services/dograh.service.js";
import { getTelephonyProvider } from "../telephony/index.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { decryptSecret, encryptSecret } from "../utils/secretCrypto.js";

const SECRET_FIELDS = ["authToken", "apiSecret"];
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

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

  if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    throw new ApiError(
      500,
      "Generated webhook URL is invalid because it contains localhost or 127.0.0.1."
    );
  }

  if (provider === "twilio") {
    console.log("Generated Twilio webhook URL:", webhookUrl);
  }

  return webhookUrl;
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

function sanitizeConfig(config) {
  const item = config.toObject ? config.toObject() : { ...config };
  for (const field of SECRET_FIELDS) {
    if (item[field]) item[field] = mask(item[field]);
  }
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

  config.webhookUrl = buildWebhookUrl(req, config.provider);
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
  if (!inboundEnabled && !outboundEnabled) {
    throw new ApiError(400, "Enable inbound, outbound, or both for this telephony configuration");
  }

  const provider = getTelephonyProvider(req.body.provider);
  const config = new TelephonyConfig({ userId: req.user._id });
  applyBody(config, { ...req.body, linkedAgentId, inboundEnabled, outboundEnabled, status: "active" }, req);
  provider.saveConfig(config);

  const dograhConfigPayload = buildDograhTelephonyConfigPayload(req.body);
  const dograhPhonePayload = buildDograhPhonePayload({ body: req.body, agent: linkedAgent, inboundEnabled, outboundEnabled });
  const dograhConfig = await createDograhTelephonyConfiguration(dograhConfigPayload);
  const dograhPhone = await addDograhTelephonyPhoneNumber(dograhConfig.dograhTelephonyConfigId, dograhPhonePayload);

  config.dograhTelephonyConfigId = String(dograhConfig.dograhTelephonyConfigId);
  config.dograhPhoneNumberId = dograhPhone.dograhPhoneNumberId ? String(dograhPhone.dograhPhoneNumberId) : "";
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
  config.webhookUrl = buildWebhookUrl(req, config.provider);
  await config.save();

  const provider = getTelephonyProvider(config.provider);
  const result = await provider.configureWebhook(config);
  res.json({ success: true, webhookUrl: config.webhookUrl, result });
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

export const handleIncomingTelephony = asyncHandler(async (req, res) => {
  const providerName = req.params.provider;
  const provider = getTelephonyProvider(providerName);
  const phoneNumber = getIncomingNumber(req);
  const callerNumber = getCallerNumber(req);

  if (!phoneNumber) {
    throw new ApiError(400, "Incoming webhook did not include the destination phone number");
  }

  const config = await findConfigForIncoming(providerName, phoneNumber);

  if (!config) {
    throw new ApiError(404, "No active telephony configuration matched this incoming number");
  }

  const agent =
    (config.linkedAgentId && await Agent.findOne({ _id: config.linkedAgentId, status: { $ne: "archived" } })) ||
    await Agent.findOne({ telephonyConfigId: config._id, status: { $ne: "archived" } });

  if (!agent) {
    throw new ApiError(404, "No active agent is linked to this telephony configuration");
  }

  const userMessage = `Incoming phone call from ${callerNumber || "unknown caller"} to ${phoneNumber || config.phoneNumber}.`;
  const reply = await runCustomAgent({
    systemPrompt: agent.systemPrompt,
    userMessage,
    tools: agent.tools,
    settings: agent.settings,
    agent
  });

  await CallLog.create({
    userId: agent.userId,
    agentId: agent._id,
    callerNumber,
    callingNumber: phoneNumber || config.phoneNumber,
    callDirection: "inbound",
    source: providerName,
    transcript: `Caller: ${userMessage}\nAgent: ${reply}`,
    status: "answered",
    rawWebhookPayload: { body: req.body, query: req.query },
    startedAt: new Date()
  });

  const response = provider.handleIncomingCall({ req, config, agent, reply });
  if (response.contentType) res.type(response.contentType);
  return res.send(response.body);
});
