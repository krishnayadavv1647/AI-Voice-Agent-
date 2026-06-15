import Agent from "../models/Agent.js";
import AgentLLMConfiguration from "../models/AgentLLMConfiguration.js";
import LLMIntegration from "../models/LLMIntegration.js";
import { getAgentLLMConfiguration, sanitizeLLMConfiguration, upsertAgentLLMConfiguration, validateLLMConfigurationOwnership } from "../services/agentLLMConfiguration.service.js";
import { syncAgentLLMConfigurationToDograh } from "../services/dograhLLMConfigSync.service.js";
import { getLLMProvider, getLLMProviderPublicMetadata, SUPPORTED_LLM_PROVIDERS } from "../services/llmProviders/LLMProviderFactory.js";
import { deduplicateModels, taskAwareCacheKey } from "../services/llmProviders/modelClassification.service.js";
import { validateLLMModel } from "../services/llmProviders/llmModelValidation.service.js";
import { normalizeLLMProvider } from "../services/llmProviders/providerIdentity.service.js";
import { clearModelCache, getCachedModels, getStaleModels, setCachedModels } from "../services/llmProviders/modelCache.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { decryptSecret, encryptSecret, maskSecret } from "../utils/crypto.js";

function userFilter(req) {
  return ["admin", "super_admin"].includes(req.user.role) ? {} : { userId: req.user._id };
}

function assertProvider(value) {
  const provider = normalizeLLMProvider(value, { allowDefault: false });
  if (!SUPPORTED_LLM_PROVIDERS.includes(provider)) throw new ApiError(400, "Unsupported LLM provider.");
  return provider;
}

function cleanString(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function credentialsFromBody(provider, body = {}) {
  const apiKey = cleanString(body.apiKey || body.apiSubscriptionKey, 2000);
  if (apiKey.length < 8) throw new ApiError(400, "A valid API key is required.");

  return {
    apiKey,
    projectId: provider === "openai" ? cleanString(body.projectId, 200) : "",
    applicationName: provider === "openrouter" ? cleanString(body.applicationName, 120) : "",
    applicationUrl: provider === "openrouter" ? cleanString(body.applicationUrl, 300) : ""
  };
}

function publicIntegration(integration, providerOverride) {
  const provider = integration?.provider || providerOverride;
  return {
    id: integration?._id || null,
    provider,
    connectionName: integration?.connectionName || "",
    credentialStatus: integration?.credentialStatus || "not_connected",
    runtimeStatus: integration?.runtimeStatus || "configuration_required",
    maskedIdentifier: integration?.maskedIdentifier || "",
    maskedApiKey: integration?.maskedIdentifier || "",
    keyLastFour: integration?.keyLastFour || "",
    lastValidatedAt: integration?.lastValidatedAt || null,
    lastValidationCode: integration?.lastValidationCode || "",
    lastError: integration?.lastErrorSafeMessage || "",
    metadata: getLLMProviderPublicMetadata(provider),
    createdAt: integration?.createdAt || null,
    updatedAt: integration?.updatedAt || null
  };
}

async function ownedIntegration(req) {
  const integration = await LLMIntegration.findOne({
    _id: req.params.integrationId,
    ...userFilter(req)
  }).select("+encryptedCredentials");
  if (!integration) throw new ApiError(404, "LLM integration not found.");
  return integration;
}

function decryptCredentials(integration) {
  return JSON.parse(decryptSecret(integration.encryptedCredentials));
}

export const listLLMIntegrations = asyncHandler(async (req, res) => {
  const integrations = await LLMIntegration.find({ userId: req.user._id }).sort({ provider: 1, connectionName: 1 });
  res.json({
    providers: SUPPORTED_LLM_PROVIDERS.map(getLLMProviderPublicMetadata),
    integrations: integrations.map((integration) => publicIntegration(integration))
  });
});

export const connectLLMIntegration = asyncHandler(async (req, res) => {
  const provider = assertProvider(req.params.provider);
  const connectionName = cleanString(req.body.connectionName, 120);
  if (!connectionName) throw new ApiError(400, "Connection name is required.");

  const credentials = credentialsFromBody(provider, req.body);
  const adapter = getLLMProvider(provider);
  await adapter.validateCredentials(credentials);

  const encryptedCredentials = encryptSecret(JSON.stringify(credentials));
  const integration = await LLMIntegration.findOneAndUpdate(
    { userId: req.user._id, provider, connectionName },
    {
      $set: {
        encryptedCredentials,
        encryptionKeyVersion: "v1",
        maskedIdentifier: maskSecret(credentials.apiKey),
        keyLastFour: credentials.apiKey.slice(-4),
        credentialStatus: "connected",
        runtimeStatus: "supported",
        lastValidatedAt: new Date(),
        lastValidationCode: "ok",
        lastErrorSafeMessage: "",
        metadata: getLLMProviderPublicMetadata(provider)
      }
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  clearModelCache(`llm:${provider}:`);
  res.status(201).json({ success: true, integration: publicIntegration(integration) });
});

export const updateLLMIntegration = asyncHandler(async (req, res) => {
  const integration = await ownedIntegration(req);
  const connectionName = cleanString(req.body.connectionName || integration.connectionName, 120);
  if (!connectionName) throw new ApiError(400, "Connection name is required.");

  const set = { connectionName };
  const newKey = cleanString(req.body.apiKey || req.body.apiSubscriptionKey, 2000);
  if (newKey) {
    const credentials = credentialsFromBody(integration.provider, req.body);
    const adapter = getLLMProvider(integration.provider);
    await adapter.validateCredentials(credentials);
    set.encryptedCredentials = encryptSecret(JSON.stringify(credentials));
    set.maskedIdentifier = maskSecret(credentials.apiKey);
    set.keyLastFour = credentials.apiKey.slice(-4);
    set.credentialStatus = "connected";
    set.runtimeStatus = "supported";
    set.lastValidatedAt = new Date();
    set.lastValidationCode = "ok";
    set.lastErrorSafeMessage = "";
    clearModelCache(`llm:${integration.provider}:`);
  }

  Object.assign(integration, set);
  await integration.save();
  res.json({ success: true, integration: publicIntegration(integration) });
});

export const testLLMIntegration = asyncHandler(async (req, res) => {
  const integration = await ownedIntegration(req);
  try {
    await getLLMProvider(integration.provider).validateCredentials(decryptCredentials(integration));
    integration.credentialStatus = "connected";
    integration.runtimeStatus = "supported";
    integration.lastValidatedAt = new Date();
    integration.lastValidationCode = "ok";
    integration.lastErrorSafeMessage = "";
    await integration.save();
    res.json({ success: true, integration: publicIntegration(integration) });
  } catch (error) {
    integration.credentialStatus = [401, 403].includes(error.statusCode) ? "invalid" : integration.credentialStatus;
    integration.lastValidatedAt = new Date();
    integration.lastValidationCode = String(error.statusCode || "error");
    integration.lastErrorSafeMessage = error.message;
    await integration.save();
    throw error;
  }
});

export const disconnectLLMIntegration = asyncHandler(async (req, res) => {
  const integration = await ownedIntegration(req);
  const affected = await AgentLLMConfiguration.find({ userId: integration.userId, integrationId: integration._id }).select("agentId");
  if (affected.length && req.query.force !== "true") {
    const agents = await Agent.find({ _id: { $in: affected.map((item) => item.agentId) }, userId: integration.userId }).select("agentName name");
    throw new ApiError(409, "This LLM integration is used by active agents. Switch those agents to Dograh Default or another account before disconnecting.", {
      affectedAgents: agents.map((agent) => ({ id: agent._id, name: agent.agentName || agent.name }))
    });
  }
  clearModelCache(`llm:${integration.provider}:`);
  await integration.deleteOne();
  res.status(204).end();
});

export const listLLMModels = asyncHandler(async (req, res) => {
  const integration = await ownedIntegration(req);
  const adapter = getLLMProvider(integration.provider);
  const cacheKey = taskAwareCacheKey({
    provider: integration.provider,
    integrationId: integration._id,
    version: adapter.modelCacheVersion || undefined
  });
  const refresh = req.query.refresh === "true";
  if (refresh) clearModelCache(cacheKey);
  if (!refresh) {
    const cached = getCachedModels(cacheKey);
    if (cached) return res.json({ provider: integration.provider, cacheVersion: adapter.modelCacheVersion || "v4", ...cached });
  }

  try {
    const models = deduplicateModels(await (adapter.listChatModels || adapter.listModels).call(adapter, decryptCredentials(integration)));
    setCachedModels(cacheKey, models);
    res.json({ provider: integration.provider, models, excludedCount: 0, cacheVersion: adapter.modelCacheVersion || "v4", cached: false });
  } catch (error) {
    const stale = getStaleModels(cacheKey);
    if (stale) return res.json({ provider: integration.provider, cacheVersion: adapter.modelCacheVersion || "v4", ...stale, warning: error.message });
    throw error;
  }
});

export const testLLMCompletion = asyncHandler(async (req, res) => {
  const integration = await ownedIntegration(req);
  const model = cleanString(req.body.model, 300);
  if (!model) throw new ApiError(400, "Model is required.");
  const adapter = getLLMProvider(integration.provider);
  const credentials = decryptCredentials(integration);
  const validatedModel = await validateLLMModel({
    provider: integration.provider,
    integrationId: integration._id,
    modelId: model,
    credentials
  });
  const result = await adapter.testCompletion({
    credentials,
    model: validatedModel,
    prompt: cleanString(req.body.prompt || "Reply exactly with: LLM connection successful", 500),
    settings: {
      ...req.body.settings,
      temperature: Number(req.body.settings?.temperature ?? 0),
      maxTokens: Math.min(Number(req.body.settings?.maxOutputTokens ?? req.body.settings?.maxTokens ?? 20), 96)
    }
  });
  res.json({
    success: true,
    provider: integration.provider,
    model: validatedModel,
    responseText: result.text,
    text: result.text,
    latencyMs: result.latencyMs,
    safeErrorCode: null
  });
});

async function ownedAgent(req) {
  const agent = await Agent.findOne({ _id: req.params.agentId, ...userFilter(req) });
  if (!agent) throw new ApiError(404, "Agent not found.");
  return agent;
}

export const getAgentLLMConfig = asyncHandler(async (req, res) => {
  const agent = await ownedAgent(req);
  const config = await getAgentLLMConfiguration({ userId: agent.userId, agent });
  res.json(config);
});

export const updateAgentLLMConfig = asyncHandler(async (req, res) => {
  const agent = await ownedAgent(req);
  const configInput = sanitizeLLMConfiguration(req.body, agent);
  await validateLLMConfigurationOwnership({ userId: agent.userId, config: configInput });
  const config = await upsertAgentLLMConfiguration({ userId: agent.userId, agent, input: configInput });
  await agent.save();
  const synced = await syncAgentLLMConfigurationToDograh({ agent, userId: agent.userId });
  res.json({ success: true, llmConfiguration: synced || config });
});
