import Agent from "../models/Agent.js";
import AgentVoiceConfiguration from "../models/AgentVoiceConfiguration.js";
import VoiceIntegration from "../models/VoiceIntegration.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { decryptSecret, encryptSecret } from "../utils/crypto.js";
import { getProviderCapabilities, getVoiceProvider, SUPPORTED_VOICE_PROVIDERS } from "../services/voiceProviders/VoiceProviderFactory.js";
import {
  getAgentVoiceConfiguration,
  sanitizeVoiceConfiguration,
  upsertAgentVoiceConfiguration,
  validateVoiceConfigurationOwnership
} from "../services/agentVoiceConfiguration.service.js";
import { getProvider } from "../providers/index.js";

function assertProvider(value) {
  const provider = String(value || "").toLowerCase();
  if (!SUPPORTED_VOICE_PROVIDERS.includes(provider)) throw new ApiError(400, "Unsupported voice provider.");
  return provider;
}

function publicIntegration(integration, providerOverride) {
  const provider = integration?.provider || providerOverride;
  return {
    id: integration?._id || null,
    provider,
    credentialStatus: integration?.credentialStatus || "not_connected",
    runtimeStatus: integration?.runtimeStatus || "configuration_required",
    maskedApiKey: integration?.keyLastFour ? `********${integration.keyLastFour}` : "",
    lastValidatedAt: integration?.lastValidatedAt || null,
    lastError: integration?.lastErrorSafeMessage || "",
    capabilities: getProviderCapabilities(provider),
    createdAt: integration?.createdAt || null,
    updatedAt: integration?.updatedAt || null
  };
}

async function connectedIntegration(userId, provider) {
  const integration = await VoiceIntegration.findOne({
    userId,
    provider,
    credentialStatus: "connected"
  }).select("+apiKeyEncrypted");
  if (!integration) throw new ApiError(400, `Connect ${provider} before using this feature.`);
  return integration;
}

function runtimeStatus(provider) {
  if (provider === "cartesia" || provider === "elevenlabs" || provider === "deepgram") return "supported";
  return "configuration_required";
}

export const listVoiceIntegrations = asyncHandler(async (req, res) => {
  const integrations = await VoiceIntegration.find({ userId: req.user._id });
  const byProvider = new Map(integrations.map((item) => [item.provider, item]));
  res.json(SUPPORTED_VOICE_PROVIDERS.map((provider) => publicIntegration(byProvider.get(provider), provider)));
});

export const connectVoiceIntegration = asyncHandler(async (req, res) => {
  const provider = assertProvider(req.params.provider);
  const apiKey = String(req.body.apiKey || "").trim();
  if (apiKey.length < 8) throw new ApiError(400, "A valid API key is required.");

  const adapter = getVoiceProvider(provider, "tts");
  await adapter.validateCredentials(apiKey);

  const integration = await VoiceIntegration.findOneAndUpdate(
    { userId: req.user._id, provider },
    {
      $set: {
        apiKeyEncrypted: encryptSecret(apiKey),
        keyLastFour: apiKey.slice(-4),
        credentialStatus: "connected",
        runtimeStatus: runtimeStatus(provider),
        lastValidatedAt: new Date(),
        lastErrorSafeMessage: "",
        metadata: { capabilities: getProviderCapabilities(provider) }
      }
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  res.status(201).json({ success: true, integration: publicIntegration(integration) });
});

export const testVoiceIntegration = asyncHandler(async (req, res) => {
  const provider = assertProvider(req.params.provider);
  const integration = await VoiceIntegration.findOne({ userId: req.user._id, provider }).select("+apiKeyEncrypted");
  if (!integration?.apiKeyEncrypted) throw new ApiError(404, `${provider} is not connected.`);

  try {
    const apiKey = decryptSecret(integration.apiKeyEncrypted);
    await getVoiceProvider(provider, "tts").validateCredentials(apiKey);
    integration.credentialStatus = "connected";
    integration.runtimeStatus = runtimeStatus(provider);
    integration.lastValidatedAt = new Date();
    integration.lastErrorSafeMessage = "";
    await integration.save();
    res.json({ success: true, integration: publicIntegration(integration) });
  } catch (error) {
    integration.credentialStatus = [401, 403].includes(error.statusCode) ? "invalid" : integration.credentialStatus;
    integration.lastValidatedAt = new Date();
    integration.lastErrorSafeMessage = error.message;
    await integration.save();
    throw error;
  }
});

export const disconnectVoiceIntegration = asyncHandler(async (req, res) => {
  const provider = assertProvider(req.params.provider);
  const integration = await VoiceIntegration.findOne({ userId: req.user._id, provider });
  if (!integration) return res.status(204).end();

  const affected = await AgentVoiceConfiguration.find({
    userId: req.user._id,
    $or: [{ sttIntegrationId: integration._id }, { ttsIntegrationId: integration._id }]
  }).select("agentId");

  if (affected.length && req.query.force !== "true") {
    const agents = await Agent.find({ _id: { $in: affected.map((item) => item.agentId) }, userId: req.user._id }).select("agentName name");
    throw new ApiError(409, "This integration is used by active agents. Select a replacement provider before disconnecting.", {
      affectedAgents: agents.map((agent) => ({ id: agent._id, name: agent.agentName || agent.name }))
    });
  }

  if (affected.length) {
    await AgentVoiceConfiguration.updateMany(
      { userId: req.user._id, $or: [{ sttIntegrationId: integration._id }, { ttsIntegrationId: integration._id }] },
      {
        $set: {
          sttProvider: "deepgram",
          sttIntegrationId: null,
          ttsProvider: "elevenlabs",
          ttsIntegrationId: null
        }
      }
    );
  }

  await integration.deleteOne();
  res.status(204).end();
});

export const listProviderVoices = asyncHandler(async (req, res) => {
  const provider = assertProvider(req.params.provider);
  const integration = await connectedIntegration(req.user._id, provider);
  const apiKey = decryptSecret(integration.apiKeyEncrypted);
  const voices = await getVoiceProvider(provider, "tts").listVoices(apiKey, req.query);
  res.json({ provider, voices });
});

export const listProviderModels = asyncHandler(async (req, res) => {
  const provider = assertProvider(req.params.provider);
  const type = req.query.type === "stt" ? "stt" : "tts";
  const integration = await connectedIntegration(req.user._id, provider);
  const apiKey = decryptSecret(integration.apiKeyEncrypted);
  const models = await getVoiceProvider(provider, type).listModels(apiKey);
  res.json({ provider, type, models });
});

export const previewProviderVoice = asyncHandler(async (req, res) => {
  const provider = assertProvider(req.params.provider);
  if (!req.body.voiceId) throw new ApiError(400, "Voice ID is required for preview.");
  const integration = await connectedIntegration(req.user._id, provider);
  const apiKey = decryptSecret(integration.apiKeyEncrypted);
  const audio = await getVoiceProvider(provider, "tts").generatePreview(apiKey, req.body);
  res.setHeader("Content-Type", audio.contentType);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", audio.buffer.length);
  res.send(audio.buffer);
});

async function ownedAgent(req) {
  const filter = ["admin", "super_admin"].includes(req.user.role)
    ? { _id: req.params.agentId }
    : { _id: req.params.agentId, userId: req.user._id };
  const agent = await Agent.findOne(filter);
  if (!agent) throw new ApiError(404, "Agent not found.");
  return agent;
}

export const getAgentVoiceConfig = asyncHandler(async (req, res) => {
  const agent = await ownedAgent(req);
  const config = await getAgentVoiceConfiguration({ userId: agent.userId, agent });
  res.json(config);
});

export const updateAgentVoiceConfig = asyncHandler(async (req, res) => {
  const agent = await ownedAgent(req);
  const configInput = sanitizeVoiceConfiguration(req.body, agent);
  await validateVoiceConfigurationOwnership({ userId: agent.userId, config: configInput });
  const config = await upsertAgentVoiceConfiguration({ userId: agent.userId, agent, input: configInput });
  await agent.save();
  // Voice choice is baked into the Vapi assistant, so refresh it (best-effort) after a config change.
  if (agent.provider === "vapi" && agent.providerAgentId) {
    try {
      await getProvider("vapi").update(agent);
    } catch (error) {
      console.error("[Voice config] Vapi assistant refresh failed:", error.message);
    }
  }
  res.json({ success: true, voiceConfiguration: config });
});
