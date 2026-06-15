import axios from "axios";
import { ApiError } from "../../utils/apiError.js";

export const providerHttp = axios.create({ timeout: 20000 });

export function providerSafeError(error, provider) {
  const status = error?.response?.status;
  if (status === 401 || status === 403) return new ApiError(401, `Invalid or unauthorized ${provider} API key.`);
  if (status === 402) return new ApiError(402, `${provider} account has insufficient credits.`);
  if (status === 404) return new ApiError(404, `${provider} voice or model was not found.`);
  if (status === 422) return new ApiError(422, `${provider} rejected the selected voice, model, language, or audio format.`);
  if (status === 429) return new ApiError(429, `${provider} rate limit reached. Try again later.`);
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
    return new ApiError(504, `${provider} connection timed out.`);
  }
  return new ApiError(502, `${provider} connection failed.`);
}

export function listFromPayload(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

export function cleanText(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

export function ensurePreviewText(value) {
  const text = cleanText(value || "Hello, this is a voice preview for your AI agent.", 500);
  if (!text) throw new ApiError(400, "Preview text is required.");
  return text;
}

export function normalizeLabels(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))
      .map(([key, item]) => [cleanText(key, 80), cleanText(item, 160)])
  );
}
