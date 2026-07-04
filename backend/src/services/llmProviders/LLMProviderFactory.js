import { GoogleGeminiProvider } from "./GoogleGeminiProvider.js";
import { GroqProvider } from "./GroqProvider.js";
import { OpenAIProvider } from "./OpenAIProvider.js";
import { OpenRouterProvider } from "./OpenRouterProvider.js";
import { SarvamProvider } from "./SarvamProvider.js";
import { SUPPORTED_LLM_PROVIDERS } from "./providerUtils.js";
import { normalizeLLMProvider } from "./providerIdentity.service.js";

const PROVIDERS = {
  openai: OpenAIProvider,
  google_gemini: GoogleGeminiProvider,
  groq: GroqProvider,
  openrouter: OpenRouterProvider,
  sarvam: SarvamProvider
};

export { SUPPORTED_LLM_PROVIDERS };

export function getLLMProvider(provider) {
  const adapter = PROVIDERS[normalizeLLMProvider(provider, { allowDefault: false })];
  if (!adapter) throw new Error("Unsupported LLM provider.");
  return adapter;
}

export function getLLMProviderPublicMetadata(provider) {
  const adapter = PROVIDERS[provider];
  return {
    provider,
    displayName: adapter?.displayName || provider,
    capabilities: {
      credentials: true,
      runtimeSupport: true
    }
  };
}
