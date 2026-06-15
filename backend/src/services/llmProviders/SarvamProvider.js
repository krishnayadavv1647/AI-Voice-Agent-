import { clampNumber, createProviderClient, normalizeModel, safeProviderError } from "./providerUtils.js";
import { filterChatModels, invalidLLMModelError, LLM_MODEL_CACHE_VERSION } from "./modelClassification.service.js";

const BASE_URL = "https://api.sarvam.ai";
const CATALOG_VERSION = "2026-06-chat-v2";

export const SARVAM_CHAT_MODELS = new Set([
  "sarvam-30b",
  "sarvam-105b",
  "sarvam-m"
]);

const MODEL_CATALOG = [
  {
    id: "sarvam-30b",
    name: "Sarvam 30B",
    description: "Current Sarvam hosted Chat Completion model recommended for low-latency voice-agent conversations.",
    category: "Recommended for Voice Agents",
    recommendedForVoiceAgents: true
  },
  {
    id: "sarvam-105b",
    name: "Sarvam 105B",
    description: "Current Sarvam hosted Chat Completion model for advanced reasoning.",
    category: "Advanced Reasoning",
    recommendedForVoice: false
  },
  {
    id: "sarvam-m",
    name: "Sarvam M",
    description: "Legacy Sarvam hosted Chat Completion model. Prefer sarvam-30b or sarvam-105b for new agents.",
    category: "Legacy",
    recommendedForVoiceAgents: false,
    legacy: true
  }
];

function normalizeSarvamModelId(value) {
  return String(value || "").trim().toLowerCase();
}

export function assertSarvamChatModel(model) {
  const id = normalizeSarvamModelId(model);
  if (!SARVAM_CHAT_MODELS.has(id)) {
    throw invalidLLMModelError();
  }
  return id;
}

function sarvamCatalogModel(id) {
  return MODEL_CATALOG.find((model) => model.id === id);
}

function normalizeAllowedSarvamModel(rawModel) {
  const id = assertSarvamChatModel(rawModel.id || rawModel.name);
  const catalog = sarvamCatalogModel(id) || {};
  return normalizeModel({
    ...catalog,
    id,
    name: catalog.name || rawModel.display_name || rawModel.name || id,
    description: catalog.description || rawModel.description || "",
    provider: "Sarvam AI",
    providerId: "sarvam",
    supportsStreaming: null,
    supportsTools: null,
    supportsJsonMode: null,
    llmCompatible: true,
    chatCompletionCompatible: true,
    legacy: Boolean(catalog.legacy),
    deprecated: false,
    raw: rawModel
  });
}

function client(credentials) {
  return createProviderClient({
    baseURL: BASE_URL,
    headers: { "api-subscription-key": credentials.apiKey },
    timeout: 30000
  });
}

export const SarvamProvider = {
  provider: "sarvam",
  displayName: "Sarvam AI",
  catalogVersion: CATALOG_VERSION,
  modelCacheVersion: LLM_MODEL_CACHE_VERSION,

  async validateCredentials(credentials) {
    try {
      await client(credentials).get("/models");
      return { success: true };
    } catch (error) {
      if (error?.response?.status === 404 || error?.response?.status === 405) return { success: true, catalogFallback: true };
      throw safeProviderError(error, "Sarvam AI");
    }
  },

  async listRawModels(credentials) {
    try {
      const response = await client(credentials).get("/models");
      const models = response.data?.models || response.data?.data || [];
      if (Array.isArray(models) && models.length) return models;
    } catch (error) {
      if (![404, 405].includes(error?.response?.status)) throw safeProviderError(error, "Sarvam AI");
    }

    return MODEL_CATALOG;
  },

  normalizeModel(rawModel) {
    return normalizeAllowedSarvamModel({ ...rawModel, id: normalizeSarvamModelId(rawModel.id || rawModel.name) });
  },

  async listChatModels(credentials) {
    const rawModels = await this.listRawModels(credentials);
    return filterChatModels(rawModels
      .map((model) => ({ ...model, id: normalizeSarvamModelId(model.id || model.name) }))
      .filter((model) => SARVAM_CHAT_MODELS.has(model.id))
      .map((model) => this.normalizeModel(model))).models;
  },

  async listModels(credentials) {
    return this.listChatModels(credentials);
  },

  async isChatCompatibleModel(model) {
    return SARVAM_CHAT_MODELS.has(normalizeSarvamModelId(model));
  },

  async testCompletion({ credentials, model, prompt, settings = {} }) {
    const chatModel = assertSarvamChatModel(model);
    const startedAt = Date.now();
    try {
      const response = await client(credentials).post("/chat/completions", {
        model: chatModel,
        messages: [{ role: "user", content: String(prompt || "Reply in one short sentence confirming that the model connection works.").slice(0, 500) }],
        temperature: clampNumber(settings.temperature, 0.2, 0, 2),
        max_tokens: Math.min(clampNumber(settings.maxTokens, 48, 1, 128), 128)
      });
      const text = String(response.data?.choices?.[0]?.message?.content || response.data?.output || response.data?.text || "").trim();
      return { text, latencyMs: Date.now() - startedAt };
    } catch (error) {
      throw safeProviderError(error, "Sarvam AI");
    }
  },

  async getCapabilities() {
    return { supportsStreaming: null, supportsTools: null, supportsJsonMode: null };
  },

  async buildDograhOverride({ credentials, agentConfiguration }) {
    const chatModel = assertSarvamChatModel(agentConfiguration.model);
    return {
      provider: "sarvam",
      api_subscription_key: credentials.apiKey,
      api_key: credentials.apiKey,
      model: chatModel,
      temperature: agentConfiguration.settings?.temperature,
      max_tokens: agentConfiguration.settings?.maxTokens
    };
  }
};
