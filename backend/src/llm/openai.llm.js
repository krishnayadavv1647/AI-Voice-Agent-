import axios from "axios";
import { ApiError } from "../utils/apiError.js";

function resolvedOpenAIKey(apiKey) {
  return String(apiKey || process.env.OPENAI_API_KEY || "").trim();
}

function numberSetting(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function maxTokens(settings = {}) {
  const raw = settings.max_tokens ?? settings.maxOutputTokens ?? settings.maxTokens;
  if (settings.voiceMode) return Math.min(Math.max(numberSetting(raw, 140), 80), 180);
  return numberSetting(raw, 512);
}

function requestPayload({ model, messages, settings = {}, stream = false }) {
  return {
    model: model || process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages,
    temperature: numberSetting(settings.temperature, settings.voiceMode ? 0.35 : 0.3),
    max_tokens: maxTokens(settings),
    stream
  };
}

export async function generateOpenAIResponse({ apiKey, model, messages, settings = {} }) {
  const key = resolvedOpenAIKey(apiKey);
  if (!key) {
    throw new ApiError(500, "OpenAI provider is not configured.");
  }

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    requestPayload({ model, messages, settings }),
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      timeout: Number(settings.timeoutMs) || undefined
    }
  );

  const text = response.data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new ApiError(502, "OpenAI returned an empty response.");
  return text;
}

export async function* streamOpenAIResponse({ apiKey, model, messages, settings = {} }) {
  const key = resolvedOpenAIKey(apiKey);
  if (!key) {
    throw new ApiError(500, "OpenAI provider is not configured.");
  }

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    requestPayload({ model, messages, settings, stream: true }),
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      responseType: "stream",
      timeout: Number(settings.timeoutMs) || undefined
    }
  );

  let buffer = "";
  for await (const chunk of response.data) {
    buffer += chunk.toString("utf8");
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";

    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch (error) {
          console.error("[OpenAI stream] skipped malformed SSE frame:", error.message);
        }
      }
    }
  }
}
