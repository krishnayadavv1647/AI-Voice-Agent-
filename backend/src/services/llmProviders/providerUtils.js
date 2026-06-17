import axios from "axios";
import { ApiError } from "../../utils/apiError.js";
import { filterChatModels, normalizeLLMModel } from "./modelClassification.service.js";
import { EXTERNAL_LLM_PROVIDERS } from "./providerIdentity.service.js";

export const SUPPORTED_LLM_PROVIDERS = EXTERNAL_LLM_PROVIDERS;

export function safeProviderError(error, providerName) {
  const status = error?.response?.status || error?.statusCode;
  const rawMessage =
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    `${providerName} request failed.`;

  let message = `${providerName} request failed.`;
  let code = "LLM_PROVIDER_ERROR";
  if (status === 401 || status === 403) {
    message = `${providerName} credentials were rejected.`;
    code = "INVALID_LLM_CREDENTIALS";
  } else if (status === 404) {
    message = `${providerName} model or endpoint was not found.`;
    code = "INVALID_LLM_MODEL";
  } else if (status === 408 || status === 504 || /timeout|timed out/i.test(rawMessage)) {
    message = `${providerName} timed out.`;
    code = "LLM_PROVIDER_TIMEOUT";
  } else if (status === 429 || /rate limit|quota/i.test(rawMessage)) {
    message = `${providerName} rate limit or quota was reached.`;
    code = "LLM_PROVIDER_RATE_LIMITED";
  } else if (/credit|billing|insufficient/i.test(rawMessage)) {
    message = `${providerName} reported insufficient credits or billing configuration.`;
    code = "LLM_PROVIDER_INSUFFICIENT_CREDITS";
  }
  else if (typeof rawMessage === "string" && rawMessage.length < 220) message = rawMessage;

  const apiError = new ApiError(status || 502, message, { code, safeErrorCode: code });
  apiError.code = code;
  apiError.safeMessage = message;
  return apiError;
}

export function createProviderClient({ baseURL, apiKey, headers = {}, timeout = 30000 }) {
  return axios.create({
    baseURL,
    timeout,
    maxContentLength: 2 * 1024 * 1024,
    maxBodyLength: 2 * 1024 * 1024,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    }
  });
}

export function normalizeModel(partial) {
  return normalizeLLMModel(partial);
}

export function filterTextModels(models) {
  return filterChatModels(models).models;
}

export function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

export function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function buildChatMessages(prompt) {
  return [
    { role: "system", content: "You are testing a voice-agent LLM connection. Reply briefly." },
    { role: "user", content: String(prompt || "Reply in one short sentence confirming that the model connection works.").slice(0, 500) }
  ];
}

export function readChatCompletionText(data) {
  return String(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "").trim();
}
