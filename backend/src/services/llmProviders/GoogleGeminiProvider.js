import { clampNumber, createProviderClient, normalizeModel, safeProviderError } from "./providerUtils.js";
import { filterChatModels, hasCommonNonLLMPattern, invalidLLMModelError, normalizeModelId } from "./modelClassification.service.js";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function client(credentials) {
  return createProviderClient({
    baseURL: BASE_URL,
    headers: { "x-goog-api-key": credentials.apiKey },
    timeout: 30000
  });
}

function category(id) {
  if (/flash-lite|flash/i.test(id)) return "Fast";
  if (/pro/i.test(id)) return "Advanced";
  return "Economical";
}

function modelId(name = "") {
  return normalizeModelId(name);
}

function isDeprecated(model) {
  return /deprecated|legacy/i.test(`${model.name || ""} ${model.displayName || ""} ${model.description || ""}`);
}

function isGeminiChatModel(model) {
  const id = modelId(model.name || model.id);
  if (!id || hasCommonNonLLMPattern(id) || isDeprecated(model)) return false;
  const metadata = [
    id,
    model.displayName,
    model.description,
    model.type,
    model.task,
    model.category
  ].filter(Boolean).join(" ").toLowerCase();
  if (/embed|embedding|aqa|imagen|veo|image|banana|nano banana|speech|tts|stt|audio|transcri/.test(metadata)) return false;
  return (model.supportedGenerationMethods || []).includes("generateContent");
}

export const GoogleGeminiProvider = {
  provider: "google_gemini",
  displayName: "Google Gemini",

  async validateCredentials(credentials) {
    try {
      await client(credentials).get("/models");
      return { success: true };
    } catch (error) {
      throw safeProviderError(error, "Google Gemini");
    }
  },

  async listRawModels(credentials) {
    try {
      const response = await client(credentials).get("/models");
      return response.data?.models || [];
    } catch (error) {
      throw safeProviderError(error, "Google Gemini");
    }
  },

  normalizeModel(model) {
    const id = modelId(model.name || model.id);
    const compatible = isGeminiChatModel(model);
    return normalizeModel({
      id,
      name: model.displayName || id,
      description: model.description || "",
      provider: "Google Gemini",
      providerId: "google_gemini",
      category: /flash|flash-lite/i.test(id) ? "Recommended for Voice Agents" : category(id),
      contextLength: model.inputTokenLimit || null,
      supportsStreaming: compatible && (model.supportedGenerationMethods || []).includes("streamGenerateContent"),
      supportsTools: compatible,
      supportsJsonMode: compatible,
      recommendedForVoiceAgents: /flash|flash-lite/i.test(id),
      deprecated: isDeprecated(model),
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

  async isChatCompatibleModel(model, credentialsOrMetadata) {
    const id = modelId(typeof model === "object" ? model.name || model.id : model);
    if (!id || hasCommonNonLLMPattern(id) || /embed|aqa|imagen|veo|image|banana|speech|tts|stt|audio|transcri/i.test(id)) return false;
    if (credentialsOrMetadata && !credentialsOrMetadata.apiKey) {
      return isGeminiChatModel({ ...credentialsOrMetadata, id, name: credentialsOrMetadata.name || id });
    }
    const credentials = credentialsOrMetadata;
    if (!credentials?.apiKey) return false;
    const rawModels = await this.listRawModels(credentials);
    return rawModels.some((raw) => modelId(raw.name || raw.id) === id && isGeminiChatModel(raw));
  },

  async testCompletion({ credentials, model, prompt, settings = {} }) {
    if (!(await this.isChatCompatibleModel(model, credentials))) throw invalidLLMModelError();
    const startedAt = Date.now();
    try {
      const response = await client(credentials).post(`/models/${encodeURIComponent(model)}:generateContent`, {
        contents: [{ role: "user", parts: [{ text: String(prompt || "Reply in one short sentence confirming that the model connection works.").slice(0, 500) }] }],
        generationConfig: {
          temperature: clampNumber(settings.temperature, 0.2, 0, 2),
          maxOutputTokens: Math.min(clampNumber(settings.maxTokens, 48, 1, 128), 128)
        }
      });
      const text = String(response.data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join("") || "").trim();
      return { text, latencyMs: Date.now() - startedAt };
    } catch (error) {
      throw safeProviderError(error, "Google Gemini");
    }
  },

  async getCapabilities() {
    return { supportsStreaming: true, supportsTools: true, supportsJsonMode: true };
  },

};
