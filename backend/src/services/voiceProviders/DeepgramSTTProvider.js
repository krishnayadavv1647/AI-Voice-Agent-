import { providerHttp, providerSafeError, listFromPayload } from "./providerUtils.js";
import { DeepgramTTSProvider } from "./DeepgramTTSProvider.js";

const BASE_URL = "https://api.deepgram.com";
function headers(apiKey) { return { Authorization: `Token ${apiKey}` }; }

const FALLBACK_MODELS = [
  { id: "nova-3-general", name: "Nova 3 General", type: "stt", recommended: true, language: "multi" },
  { id: "flux-general-en", name: "Flux General English", type: "stt", language: "en" }
];

export const DeepgramSTTProvider = {
  provider: "deepgram",
  type: "stt",
  capabilities: {
    supportsStreaming: true,
    supportsInterimResults: true,
    supportsSmartFormatting: true,
    supportsPunctuation: true,
    dograhRuntimeSupport: true
  },
  validateCredentials: DeepgramTTSProvider.validateCredentials,
  async listModels(apiKey) {
    try {
      const response = await providerHttp.get(`${BASE_URL}/v1/models`, { headers: headers(apiKey) });
      const models = listFromPayload(response.data?.stt || response.data, ["stt", "models"])
        .map((model) => ({
          id: model.name || model.model || model.id || model.model_id,
          name: model.display_name || model.canonical_name || model.name || model.model || model.id,
          type: "stt",
          language: model.language || model.languages?.join?.(", ") || "",
          version: model.version || ""
        }))
        .filter((model) => model.id && !String(model.id).toLowerCase().startsWith("aura"));
      return models.length ? models : FALLBACK_MODELS;
    } catch (error) {
      if (error?.statusCode === 401 || error?.statusCode === 403) throw providerSafeError(error, "Deepgram");
      return FALLBACK_MODELS;
    }
  }
};
