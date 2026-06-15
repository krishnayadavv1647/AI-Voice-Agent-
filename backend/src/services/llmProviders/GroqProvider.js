import { buildChatMessages, clampNumber, createProviderClient, normalizeModel, readChatCompletionText, safeProviderError } from "./providerUtils.js";
import { isGroqChatModelId } from "./catalogs/groqChatModels.js";
import { filterChatModels, invalidLLMModelError } from "./modelClassification.service.js";

const BASE_URL = "https://api.groq.com/openai/v1";

function client(credentials) {
  return createProviderClient({ baseURL: BASE_URL, apiKey: credentials.apiKey });
}

function recommended(id) {
  return /llama-3\.1-8b|llama-3\.3-70b|mixtral|gemma2-9b|llama-3\.1-70b/i.test(id);
}

export const GroqProvider = {
  provider: "groq",
  displayName: "Groq",

  async validateCredentials(credentials) {
    try {
      await client(credentials).get("/models");
      return { success: true };
    } catch (error) {
      throw safeProviderError(error, "Groq");
    }
  },

  async listRawModels(credentials) {
    try {
      const response = await client(credentials).get("/models");
      return response.data?.data || [];
    } catch (error) {
      throw safeProviderError(error, "Groq");
    }
  },

  normalizeModel(model) {
    const compatible = isGroqChatModelId(model.id);
    return normalizeModel({
      id: model.id,
      name: model.id,
      provider: "Groq",
      providerId: "groq",
      category: recommended(model.id) ? "Recommended for Voice Agents" : "Fast",
      contextLength: model.context_window || null,
      supportsStreaming: compatible,
      supportsTools: compatible,
      supportsJsonMode: compatible,
      recommendedForVoiceAgents: recommended(model.id),
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
    if (!isGroqChatModelId(id)) return false;
    if (!credentials?.apiKey) return true;
    const rawModels = await this.listRawModels(credentials);
    return rawModels.some((raw) => raw.id === id && isGroqChatModelId(raw.id));
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
      throw safeProviderError(error, "Groq");
    }
  },

  async getCapabilities() {
    return { supportsStreaming: true, supportsTools: true, supportsJsonMode: true };
  },

  async buildDograhOverride({ credentials, agentConfiguration }) {
    return {
      provider: "groq",
      api_key: credentials.apiKey,
      model: agentConfiguration.model,
      temperature: agentConfiguration.settings?.temperature,
      max_tokens: agentConfiguration.settings?.maxTokens
    };
  }
};
