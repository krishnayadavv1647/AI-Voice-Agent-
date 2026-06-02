import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import TelephonyConfig from "../models/TelephonyConfig.js";
import { runCustomAgent } from "../services/customAgentRuntime.js";
import { getTelephonyProvider } from "../telephony/index.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { decryptSecret, encryptSecret } from "../utils/secretCrypto.js";

const SECRET_FIELDS = ["authToken", "apiSecret"];

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

function sanitizeConfig(config) {
  const item = config.toObject ? config.toObject() : { ...config };
  for (const field of SECRET_FIELDS) {
    if (item[field]) item[field] = mask(item[field]);
  }
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
    "status"
  ];

  for (const field of allowedFields) {
    if (body[field] === undefined) continue;
    if (SECRET_FIELDS.includes(field) && isMaskedSecret(body[field])) continue;
    config[field] = SECRET_FIELDS.includes(field) ? encryptSecret(body[field]) : body[field];
  }

  config.webhookUrl = buildWebhookUrl(req, config.provider);
}

async function syncLinkedAgent(config) {
  await Agent.updateMany({ telephonyConfigId: config._id }, { $set: { telephonyConfigId: null } });
  if (!config.linkedAgentId) return;

  const agent = await Agent.findOne({ _id: config.linkedAgentId, userId: config.userId });
  if (!agent) throw new ApiError(400, "Linked agent was not found for this user");

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

  const provider = getTelephonyProvider(req.body.provider);
  const config = new TelephonyConfig({ userId: req.user._id });
  applyBody(config, req.body, req);
  provider.saveConfig(config);
  await config.save();
  await syncLinkedAgent(config);

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
