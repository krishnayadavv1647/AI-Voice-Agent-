import { ApiError } from "../../utils/apiError.js";

export const CANONICAL_LLM_PROVIDERS = [
  "dograh_default",
  "openai",
  "google_gemini",
  "groq",
  "openrouter",
  "sarvam"
];

export const EXTERNAL_LLM_PROVIDERS = CANONICAL_LLM_PROVIDERS.filter((provider) => provider !== "dograh_default");

const PROVIDER_ALIASES = new Map([
  ["google", "google_gemini"],
  ["gemini", "google_gemini"],
  ["google_ai", "google_gemini"],
  ["google-ai", "google_gemini"],
  ["googleai", "google_gemini"],
  ["googleGemini", "google_gemini"],
  ["google_gemini", "google_gemini"]
]);

export function invalidLLMProviderError() {
  const error = new ApiError(400, "The selected LLM provider is not supported.", {
    code: "INVALID_LLM_PROVIDER",
    message: "The selected LLM provider is not supported."
  });
  error.code = "INVALID_LLM_PROVIDER";
  error.status = 400;
  error.safeMessage = error.message;
  return error;
}

export function normalizeLLMProvider(value, { allowDefault = true, allowAliases = true } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return allowDefault ? "dograh_default" : "";
  const lower = raw.toLowerCase();
  const alias = allowAliases ? PROVIDER_ALIASES.get(raw) || PROVIDER_ALIASES.get(lower) : null;
  const provider = alias || lower;
  if (!allowDefault && provider === "dograh_default") throw invalidLLMProviderError();
  if (!CANONICAL_LLM_PROVIDERS.includes(provider)) throw invalidLLMProviderError();
  return provider;
}
