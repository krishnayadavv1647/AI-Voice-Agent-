import { GoogleGenAI } from "@google/genai";
import { ApiError } from "../utils/apiError.js";

function resolvedGeminiKey(apiKey) {
  return String(apiKey || process.env.GEMINI_API_KEY || "").trim();
}

function resolvedGeminiModel(model) {
  return String(model || process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
}

function numberSetting(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, fallback, min, max) {
  return Math.min(Math.max(numberSetting(value, fallback), min), max);
}

function geminiConfig(settings = {}) {
  const config = {
    temperature: numberSetting(settings.temperature, settings.voiceMode ? 0.35 : 0.3),
    maxOutputTokens: settings.voiceMode
      ? clampNumber(settings.maxOutputTokens ?? settings.maxTokens, 200, 80, 400)
      : numberSetting(settings.maxOutputTokens ?? settings.maxTokens, 512)
  };

  // Gemini 2.5 Flash/Flash-Lite enable "thinking" by default, which spends time on
  // hidden reasoning tokens before emitting the first spoken token. On a live call
  // that latency is unacceptable, so disable thinking for voice unless explicitly
  // overridden. thinkingBudget: 0 turns thinking off on the models that support it.
  if (settings.voiceMode) {
    const requestedBudget = Number(settings.thinkingBudget);
    config.thinkingConfig = {
      thinkingBudget: Number.isFinite(requestedBudget) ? requestedBudget : 0
    };
  } else if (settings.thinkingBudget !== undefined) {
    const requestedBudget = Number(settings.thinkingBudget);
    if (Number.isFinite(requestedBudget)) {
      config.thinkingConfig = { thinkingBudget: requestedBudget };
    }
  }

  const topP = Number(settings.topP);
  if (Number.isFinite(topP)) config.topP = Math.min(Math.max(topP, 0), 1);
  return config;
}

function geminiClient(apiKey, settings = {}) {
  const timeoutMs = Number(settings.timeoutMs);
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs } });
  }
  return new GoogleGenAI({ apiKey });
}

function geminiMessages(messages = []) {
  const systemMessage = messages.find((message) => message.role === "system")?.content || "";
  const userMessages = messages
    .filter((message) => message.role !== "system")
    .filter((message) => message.content && String(message.content).trim())
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content).trim() }]
    }));

  return { systemMessage, userMessages };
}

export async function generateGeminiResponse({ apiKey, model, messages, settings = {} }) {
  const key = resolvedGeminiKey(apiKey);
  if (!key) {
    throw new ApiError(500, "Gemini provider is not configured.");
  }

  const selectedModel = resolvedGeminiModel(model);
  const ai = geminiClient(key, settings);
  const { systemMessage, userMessages } = geminiMessages(messages);

  if (!userMessages.length) {
    throw new ApiError(400, "Message is required.");
  }

  try {
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: userMessages,
      config: {
        systemInstruction: systemMessage || undefined,
        ...geminiConfig(settings)
      }
    });

    const text = response.text?.trim();
    if (!text) throw new ApiError(502, "Gemini returned an empty response.");
    return text;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    const geminiError = parseGeminiError(error);
    const details = {
      status: error.status || error.response?.status || geminiError.status,
      message: geminiError.message,
      code: geminiError.code,
      details: geminiError.details
    };

    console.error("Gemini LLM response failed:", details);

    throw new ApiError(
      details.status || 502,
      friendlyGeminiMessage(details),
      details
    );
  }
}

export async function* streamGeminiResponse({ apiKey, model, messages, settings = {} }) {
  const key = resolvedGeminiKey(apiKey);
  if (!key) {
    throw new ApiError(500, "Gemini provider is not configured.");
  }

  const selectedModel = resolvedGeminiModel(model);
  if (!selectedModel) {
    throw new ApiError(500, "Gemini model is not configured.");
  }

  const { systemMessage, userMessages } = geminiMessages(messages);
  if (!userMessages.length) {
    throw new ApiError(400, "Message is required.");
  }

  try {
    const ai = geminiClient(key, settings);
    const stream = await ai.models.generateContentStream({
      model: selectedModel,
      contents: userMessages,
      config: {
        systemInstruction: systemMessage || undefined,
        ...geminiConfig(settings)
      }
    });

    let finishReason = null;
    for await (const chunk of stream) {
      const text = typeof chunk.text === "function" ? chunk.text() : chunk.text;
      const value = String(text || "");
      if (value) yield value;
      const reason = chunk?.candidates?.[0]?.finishReason;
      if (reason) finishReason = reason;
    }

    // A non-STOP finish reason (MAX_TOKENS, SAFETY, RECITATION…) means Gemini ended the
    // reply early — the caller hears a sentence that stops mid-thought. Surface it so the
    // cause is visible in logs instead of looking like a random cutoff.
    if (finishReason && finishReason !== "STOP" && finishReason !== "FINISH_REASON_STOP") {
      console.warn("[Gemini stream] reply ended early — may be cut off mid-sentence", {
        finishReason,
        model: selectedModel,
        maxOutputTokens: geminiConfig(settings).maxOutputTokens
      });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;

    const geminiError = parseGeminiError(error);
    const details = {
      status: error.status || error.response?.status || geminiError.status,
      message: geminiError.message,
      code: geminiError.code,
      details: geminiError.details
    };

    console.error("Gemini LLM stream failed:", details);
    throw new ApiError(details.status || 502, friendlyGeminiMessage(details), details);
  }
}

function parseGeminiError(error) {
  const raw = error.response?.data?.error || error.error || error.message;

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed.error || parsed;
    } catch {
      return { message: raw };
    }
  }

  return raw || { message: error.message };
}

function friendlyGeminiMessage(details) {
  const message = details.message || "Gemini text reply failed.";

  if (details.status === 429 || details.code === 429 || /quota|RESOURCE_EXHAUSTED/i.test(message)) {
    const retryDelay = findRetryDelay(details.details);
    return retryDelay
      ? `Gemini quota exceeded. Please retry in about ${retryDelay}, or enable billing/increase quota for the Gemini API.`
      : "Gemini quota exceeded. Enable billing/increase quota for the Gemini API, or try again later.";
  }

  return message;
}

function findRetryDelay(details) {
  if (!Array.isArray(details)) return "";
  const retryInfo = details.find((item) => item?.retryDelay);
  if (!retryInfo?.retryDelay) return "";
  return String(retryInfo.retryDelay).replace(/s$/, " seconds");
}
