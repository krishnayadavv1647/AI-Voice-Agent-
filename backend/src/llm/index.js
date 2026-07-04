import { ApiError } from "../utils/apiError.js";
import { generateGeminiResponse, streamGeminiResponse } from "./gemini.llm.js";
import { generateOpenAIResponse, streamOpenAIResponse } from "./openai.llm.js";
import { normalizeLLMProvider } from "../services/llmProviders/providerIdentity.service.js";

function normalizeRuntimeProvider(provider = "google_gemini") {
  const value = provider === "platform_default" ? "google_gemini" : String(provider || "google_gemini").trim();
  const normalizedValue = value.toLowerCase() === "google gemini" ? "google_gemini" : value;
  return normalizeLLMProvider(normalizedValue);
}

export async function generateLLMResponse({ provider = "google_gemini", apiKey, model, messages, settings }) {
  const canonicalProvider = normalizeRuntimeProvider(provider);
  switch (canonicalProvider) {
    case "google_gemini":
      return generateGeminiResponse({ apiKey, model, messages, settings });
    case "openai":
      return generateOpenAIResponse({ apiKey, model, messages, settings });
    default:
      throw new ApiError(400, `LLM provider missing or unsupported: ${canonicalProvider}`);
  }
}

export async function* generateLLMResponseStream({ provider = "google_gemini", apiKey, model, messages, settings }) {
  const canonicalProvider = normalizeRuntimeProvider(provider);
  switch (canonicalProvider) {
    case "google_gemini":
      yield* streamGeminiResponse({ apiKey, model, messages, settings });
      return;
    case "openai":
      yield* streamOpenAIResponse({ apiKey, model, messages, settings });
      return;
    default:
      throw new ApiError(400, `LLM provider missing or unsupported: ${canonicalProvider}`);
  }
}
