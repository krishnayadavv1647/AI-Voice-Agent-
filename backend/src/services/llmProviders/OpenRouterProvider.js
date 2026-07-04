import { buildChatMessages, clampNumber, createProviderClient, normalizeModel, readChatCompletionText, safeProviderError } from "./providerUtils.js";
import { filterChatModels, hasCommonNonLLMPattern, invalidLLMModelError, positiveChatHeuristic } from "./modelClassification.service.js";

const BASE_URL = "https://openrouter.ai/api/v1";

function client(credentials) {
  return createProviderClient({
    baseURL: BASE_URL,
    apiKey: credentials.apiKey,
    headers: {
      ...(credentials.applicationName ? { "X-Title": credentials.applicationName } : {}),
      ...(credentials.applicationUrl ? { "HTTP-Referer": credentials.applicationUrl } : {})
    }
  });
}

function recommended(id = "") {
  return /gpt-4o-mini|llama-3\.1-8b|llama-3\.3|gemini.*flash|mistral.*small|qwen.*7b/i.test(id);
}

function category(model) {
  const id = String(model.id || "");
  if (recommended(id)) return "Recommended for Voice Agents";
  if (Number(model.pricing?.prompt || 1) === 0 && Number(model.pricing?.completion || 1) === 0) return "Free";
  if (/reason|r1|thinking/i.test(id)) return "Reasoning";
  if (/mini|small|flash|8b|7b/i.test(id)) return "Fast";
  return "All Models";
}

function hasTextOutput(model = {}) {
  const output = model.output_modalities || model.outputModality || model.outputModalities;
  const modality = String(model.modality || "").toLowerCase();
  if (Array.isArray(output)) return output.some((item) => String(item).toLowerCase() === "text");
  if (output) return /text/.test(String(output).toLowerCase());
  return !modality || /text/.test(modality);
}

function isOpenRouterChatModel(model = {}) {
  const id = String(model.id || "").trim();
  if (!id || hasCommonNonLLMPattern(id)) return false;
  const metadata = [
    model.name,
    model.description,
    model.architecture?.modality,
    model.modality,
    ...(model.input_modalities || []),
    ...(model.output_modalities || [])
  ].filter(Boolean).join(" ").toLowerCase();
  if (/embedding|moderation|image generation|text-to-image|audio-only|speech|tts|stt|whisper|transcri|rerank/.test(metadata)) return false;
  return hasTextOutput(model) && (positiveChatHeuristic(id) || !/image|audio|speech|embed|moderation|rerank/i.test(id));
}

export const OpenRouterProvider = {
  provider: "openrouter",
  displayName: "OpenRouter",

  async validateCredentials(credentials) {
    try {
      await client(credentials).get("/models");
      return { success: true };
    } catch (error) {
      throw safeProviderError(error, "OpenRouter");
    }
  },

  async listRawModels(credentials) {
    try {
      const response = await client(credentials).get("/models");
      return response.data?.data || [];
    } catch (error) {
      throw safeProviderError(error, "OpenRouter");
    }
  },

  normalizeModel(model) {
    const compatible = isOpenRouterChatModel(model);
    return normalizeModel({
      id: model.id,
      name: model.name || model.id,
      description: model.description || "",
      provider: model.id?.split("/")?.[0] || "OpenRouter",
      providerId: "openrouter",
      category: category(model),
      contextLength: model.context_length || null,
      supportsStreaming: compatible,
      supportsTools: compatible && Boolean(model.supported_parameters?.includes?.("tools")),
      supportsJsonMode: compatible && Boolean(model.supported_parameters?.includes?.("response_format")),
      supportsVision: /image|vision/i.test(`${model.architecture?.modality || ""} ${(model.input_modalities || []).join(" ")}`),
      inputPrice: model.pricing?.prompt || null,
      outputPrice: model.pricing?.completion || null,
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
    if (!id || hasCommonNonLLMPattern(id)) return false;
    if (!credentials?.apiKey) return positiveChatHeuristic(id);
    const rawModels = await this.listRawModels(credentials);
    return rawModels.some((raw) => raw.id === id && isOpenRouterChatModel(raw));
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
      throw safeProviderError(error, "OpenRouter");
    }
  },

  async getCapabilities() {
    return { supportsStreaming: true, supportsTools: true, supportsJsonMode: true };
  }
};
