import { ApiError } from "../utils/apiError.js";
import { generateGeminiResponse } from "./gemini.llm.js";
import { generateOpenAIResponse } from "./openai.llm.js";
import { normalizeLLMProvider } from "../services/llmProviders/providerIdentity.service.js";

export async function generateLLMResponse({ provider = "google_gemini", model, messages, settings }) {
  const canonicalProvider = normalizeLLMProvider(provider === "dograh_default" ? "google_gemini" : provider);
  switch (canonicalProvider) {
    case "google_gemini":
      return generateGeminiResponse({ model, messages, settings });
    case "openai":
      return generateOpenAIResponse({ model, messages, settings });
    default:
      throw new ApiError(400, `LLM provider missing or unsupported: ${canonicalProvider}`);
  }
}
