import AgentLLMConfiguration from "../models/AgentLLMConfiguration.js";
import LLMIntegration from "../models/LLMIntegration.js";
import { normalizeModelId } from "./llmProviders/modelClassification.service.js";
import { validateLLMModel } from "./llmProviders/llmModelValidation.service.js";
import { CANONICAL_LLM_PROVIDERS, invalidLLMProviderError, normalizeLLMProvider } from "./llmProviders/providerIdentity.service.js";
import { ApiError } from "../utils/apiError.js";

const PROVIDERS = CANONICAL_LLM_PROVIDERS;

function cleanString(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function nullableObjectId(value) {
  if (!value) return null;
  return value;
}

export function defaultLLMConfigurationForAgent(agent) {
  return {
    integrationId: null,
    provider: "dograh_default",
    model: "",
    settings: {
      temperature: number(agent?.settings?.temperature, 0.4, 0, 2),
      maxTokens: 512,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      timeoutMs: 30000,
      streaming: true,
      toolCalling: true,
      fallbackToDograhDefault: false
    },
    dograhSyncStatus: "not_configured",
    dograhLastSyncedAt: null,
    dograhSyncError: "",
    dograhEffectiveProvider: "",
    dograhEffectiveModel: ""
  };
}

export function sanitizeLLMConfiguration(input = {}, agent) {
  const defaults = defaultLLMConfigurationForAgent(agent);
  const provider = normalizeLLMProvider(cleanString(input.provider || defaults.provider, 40));
  if (!PROVIDERS.includes(provider)) throw invalidLLMProviderError();
  const model = provider === "dograh_default" ? "" : normalizeModelId(cleanString(input.model || "", 300));

  const settings = { ...defaults.settings, ...asObject(input.settings) };

  return {
    integrationId: provider === "dograh_default" ? null : nullableObjectId(input.integrationId),
    provider,
    model,
    settings: {
      temperature: number(settings.temperature, 0.4, 0, 2),
      maxTokens: number(settings.maxTokens, 512, 16, 4096),
      topP: number(settings.topP, 1, 0, 1),
      frequencyPenalty: number(settings.frequencyPenalty, 0, -2, 2),
      presencePenalty: number(settings.presencePenalty, 0, -2, 2),
      timeoutMs: number(settings.timeoutMs, 30000, 5000, 120000),
      streaming: settings.streaming !== false,
      toolCalling: settings.toolCalling !== false,
      fallbackToDograhDefault: Boolean(settings.fallbackToDograhDefault)
    }
  };
}

export async function validateLLMConfigurationOwnership({ userId, config }) {
  if (config.provider === "dograh_default") return null;
  if (!config.integrationId) throw new ApiError(400, `Choose a connected ${config.provider} account before saving this LLM provider.`);
  if (!config.model) throw new ApiError(400, "Choose an LLM model before saving this agent.");

  const integration = await LLMIntegration.findOne({
    _id: config.integrationId,
    userId,
    provider: config.provider,
    credentialStatus: "connected"
  }).select("+encryptedCredentials");
  if (!integration) throw new ApiError(400, "Connected LLM integration was not found for this user.");
  if (!["supported", "configuration_required"].includes(integration.runtimeStatus)) {
    throw new ApiError(400, "This LLM provider is not currently supported by the Dograh runtime.");
  }
  await validateLLMModel({
    provider: config.provider,
    integrationId: config.integrationId,
    modelId: config.model,
    userId,
    credentials: null
  });
  return integration;
}

export function applyLLMConfigurationToAgent(agent, config) {
  agent.llmProvider = config.provider;
  agent.llmModel = config.provider === "dograh_default" ? "" : config.model || "";
  agent.settings = {
    ...asObject(agent.settings),
    llm: {
      provider: config.provider,
      model: config.model || "",
      temperature: config.settings?.temperature,
      maxTokens: config.settings?.maxTokens
    }
  };
}

export async function upsertAgentLLMConfiguration({ userId, agent, input, markPending = true }) {
  const config = sanitizeLLMConfiguration(input || {}, agent);
  await validateLLMConfigurationOwnership({ userId, config });
  applyLLMConfigurationToAgent(agent, config);

  return AgentLLMConfiguration.findOneAndUpdate(
    { agentId: agent._id, userId },
    {
      $set: {
        ...config,
        userId,
        agentId: agent._id,
        ...(markPending ? { dograhSyncStatus: agent.provider === "dograh" ? "pending" : "not_configured", dograhSyncError: "" } : {})
      }
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

export async function getAgentLLMConfiguration({ userId, agent }) {
  const saved = await AgentLLMConfiguration.findOne({ agentId: agent._id, userId });
  if (saved) return saved;
  return {
    userId,
    agentId: agent._id,
    ...defaultLLMConfigurationForAgent(agent)
  };
}
