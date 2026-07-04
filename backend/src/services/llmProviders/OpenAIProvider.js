import { buildChatMessages, clampNumber, createProviderClient, normalizeModel, readChatCompletionText, safeProviderError } from "./providerUtils.js";
import { filterChatModels, hasCommonNonLLMPattern, invalidLLMModelError } from "./modelClassification.service.js";

const BASE_URL = "https://api.openai.com/v1";

function client(credentials) {
  return createProviderClient({
    baseURL: BASE_URL,
    apiKey: credentials.apiKey,
    headers: credentials.projectId ? { "OpenAI-Project": credentials.projectId } : {}
  });
}

function recommended(id) {
  return /gpt-4o-mini|gpt-4\.1-mini|gpt-4\.1-nano|gpt-4o-realtime|gpt-4o$/.test(id);
}

function isOpenAIChatModelId(modelId) {
  const id = String(modelId || "").trim();
  if (!id || hasCommonNonLLMPattern(id)) return false;
  if (/-0301|-0613|-1106/.test(id)) return false;
  if (/instruct|base|search|realtime|audio|transcribe|tts|image/i.test(id)) return false;
  return /^gpt-/i.test(id) || /^o[134]/i.test(id) || /^chatgpt-/i.test(id);
}

export const OpenAIProvider = {
  provider: "openai",
  displayName: "OpenAI",

  async validateCredentials(credentials) {
    try {
      await client(credentials).get("/models");
      return { success: true };
    } catch (error) {
      throw safeProviderError(error, "OpenAI");
    }
  },

  async listRawModels(credentials) {
    try {
      const response = await client(credentials).get("/models");
      return response.data?.data || [];
    } catch (error) {
      throw safeProviderError(error, "OpenAI");
    }
  },

  normalizeModel(model) {
    const compatible = isOpenAIChatModelId(model.id);
    return normalizeModel({
      id: model.id,
      name: model.id,
      provider: "OpenAI",
      providerId: "openai",
      category: recommended(model.id) ? "Recommended for Voice Agents" : null,
      supportsStreaming: compatible,
      supportsTools: compatible,
      supportsJsonMode: compatible,
      recommendedForVoiceAgents: recommended(model.id),
      deprecated: /-0301|-0613|-1106/.test(model.id),
      llmCompatible: compatible,
      chatCompletionCompatible: compatible,
      raw: model
    });
  },

  async listChatModels(credentials) {
    const rawModels = await this.listRawModels(credentials);
    return filterChatModels(rawModels.map((model) => this.normalizeModel(model))).models;
  },

  async listModels(credentials) {
    return this.listChatModels(credentials);
  },

  async isChatCompatibleModel(model, credentials) {
    const id = String(model || "").trim();
    if (!isOpenAIChatModelId(id)) return false;
    if (!credentials?.apiKey) return true;
    const rawModels = await this.listRawModels(credentials);
    return rawModels.some((raw) => raw.id === id && isOpenAIChatModelId(raw.id));
  },

  async testCompletion({ credentials, model, prompt, settings = {} }) {
    if (!(await this.isChatCompatibleModel(model, credentials))) throw invalidLLMModelError();
    const startedAt = Date.now();
    try {
      const response = await client(credentials).post("/chat/completions", {
        model,
        messages: buildChatMessages(prompt),
        temperature: clampNumber(settings.temperature, 0.2, 0, 2),
        max_tokens: Math.min(clampNumber(settings.maxTokens, 48, 1, 128), 128)
      });
      return { text: readChatCompletionText(response.data), latencyMs: Date.now() - startedAt };
    } catch (error) {
      throw safeProviderError(error, "OpenAI");
    }
  },

  async getCapabilities() {
    return { supportsStreaming: true, supportsTools: true, supportsJsonMode: true };
  }
};
