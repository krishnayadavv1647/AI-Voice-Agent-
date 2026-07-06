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

// Constructing a GoogleGenAI client pays DNS + TCP + TLS setup before the request even starts.
// Reuse one client per (apiKey, timeoutMs) pair so only the first call per key eats that cost.
// Capped so per-user connected-account keys can't grow this unbounded.
const clientCache = new Map(); // `${apiKey}:${timeoutMs||"default"}` -> GoogleGenAI
const CLIENT_CACHE_MAX = 20;

export function geminiClient(apiKey, settings = {}) {
  const timeoutMs = Number(settings.timeoutMs);
  const key = `${apiKey}:${Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : "default"}`;
  let client = clientCache.get(key);
  if (!client) {
    client = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? new GoogleGenAI({ apiKey, httpOptions: { timeout: timeoutMs } })
      : new GoogleGenAI({ apiKey });
    if (clientCache.size >= CLIENT_CACHE_MAX) {
      clientCache.delete(clientCache.keys().next().value);
    }
    clientCache.set(key, client);
  }
  return client;
}

// Keeps DNS/TLS warm between real calls. Best-effort — a failed warmup must never affect a live call.
export async function warmGeminiConnection() {
  const key = resolvedGeminiKey();
  if (!key) return;
  try {
    const ai = geminiClient(key, {});
    await ai.models.generateContent({
      model: process.env.GEMINI_VOICE_MODEL || "gemini-2.5-flash-lite",
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      config: { maxOutputTokens: 5, thinkingConfig: { thinkingBudget: 0 } }
    });
  } catch (error) {
    console.warn("[gemini warmup] failed:", error.message);
  }
}

// Resolves the first chunk of an async iterator, or signals a timeout — whichever comes first.
// The timer is cleared as soon as a result arrives, and a late result after timeout is dropped
// so the caller never processes (or yields) the same chunk twice.
function firstChunkOrTimeout(iterator, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ timedOut: true });
    }, timeoutMs);

    iterator.next().then(
      (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ timedOut: false, result });
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ timedOut: false, error });
      }
    );
  });
}

// Generic first-token watchdog: if `createStream()`'s first chunk doesn't arrive within
// timeoutMs, abandon it and retry once with a fresh stream from the same factory. If the
// retry also stalls, fall through to a plain (un-timed) await so the normal error/fallback
// path upstream still gets a chance to resolve or fail naturally. Chunks after the first are
// never subject to the watchdog.
export async function* streamWithFirstTokenWatchdog(createStream, { timeoutMs = 4000, model } = {}) {
  let iterator = (await createStream())[Symbol.asyncIterator]();
  let first = await firstChunkOrTimeout(iterator, timeoutMs);

  if (first.timedOut) {
    console.warn("[Gemini stream] first-token timeout, retrying once", { model, timeoutMs });
    try {
      await iterator.return?.();
    } catch {
      // best-effort cleanup of the abandoned stream
    }
    iterator = (await createStream())[Symbol.asyncIterator]();
    first = await firstChunkOrTimeout(iterator, timeoutMs);
  }

  let pendingResult;
  if (first.timedOut) {
    pendingResult = await iterator.next();
  } else if (first.error) {
    throw first.error;
  } else {
    pendingResult = first.result;
  }

  while (!pendingResult.done) {
    yield pendingResult.value;
    pendingResult = await iterator.next();
  }
}

// Errors that mean "this model/endpoint is temporarily unusable" — worth trying the next model in
// the chain rather than failing the call.
function isFallbackEligibleError(error) {
  const status = Number(error?.status || error?.response?.status);
  if (status === 503 || status === 429) return true;
  const parsed = parseGeminiError(error);
  const code = Number(parsed?.code);
  if (code === 503 || code === 429) return true;
  const message = String(parsed?.message || error?.message || "");
  return /\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(message);
}

function fallbackReason(error) {
  const status = error?.status || error?.response?.status;
  const parsed = parseGeminiError(error);
  return String(status || parsed?.code || parsed?.message || error?.message || "error");
}

// Voice-mode streaming with a model fallback chain. For each model, race the FIRST chunk against a
// short timer; on a 503/429/UNAVAILABLE/RESOURCE_EXHAUSTED error or a first-token stall, abandon the
// attempt and try the next model. Once a chunk has been yielded the model is committed — a later
// mid-stream error propagates via the normal partial-output path (no switch, no double-yield).
export async function* streamGeminiVoiceWithFallback({ ai, selectedModel, userMessages, systemMessage, settings = {} }) {
  const fallbacks = (process.env.GEMINI_VOICE_FALLBACK_MODELS || "gemini-2.5-flash,gemini-2.0-flash-lite")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const modelChain = [...new Set([selectedModel, ...fallbacks])];
  const timeoutMs = settings.firstTokenTimeoutMs || 3000;
  const config = geminiConfig(settings);

  let lastError = null;

  for (let i = 0; i < modelChain.length; i++) {
    const model = modelChain[i];
    const nextModel = modelChain[i + 1];
    const hasNext = i < modelChain.length - 1;

    let iterator = null;
    let startError = null;
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: userMessages,
        config: { systemInstruction: systemMessage || undefined, ...config }
      });
      iterator = stream[Symbol.asyncIterator]();
    } catch (error) {
      startError = error;
    }

    const first = iterator ? await firstChunkOrTimeout(iterator, timeoutMs) : null;

    // Attempt failed to produce a first chunk (start error, first-chunk error, or timeout).
    const attemptError = startError || first?.error;
    if (attemptError || first?.timedOut) {
      if (iterator) { try { await iterator.return?.(); } catch { /* best-effort cleanup */ } }
      const reason = attemptError ? fallbackReason(attemptError) : "first-token-timeout";
      const eligible = attemptError ? isFallbackEligibleError(attemptError) : true;

      if (eligible && hasNext) {
        console.warn("[Gemini fallback] switching model", { from: model, to: nextModel, reason });
        lastError = attemptError || new Error(`first-token timeout after ${timeoutMs}ms on ${model}`);
        continue;
      }
      // No next model, or a non-retryable error: surface it (outer handler maps to ApiError).
      throw attemptError || new Error(`first-token timeout after ${timeoutMs}ms on ${model}`);
    }

    // Committed to this model. Yield the first chunk and everything after it; a mid-stream error
    // now throws out of here unchanged (matching the existing partial-output behavior).
    let pendingResult = first.result;
    let finishReason = null;
    while (!pendingResult.done) {
      const chunk = pendingResult.value;
      const text = typeof chunk.text === "function" ? chunk.text() : chunk.text;
      const value = String(text || "");
      if (value) yield value;
      const reason = chunk?.candidates?.[0]?.finishReason;
      if (reason) finishReason = reason;
      pendingResult = await iterator.next();
    }

    if (finishReason && finishReason !== "STOP" && finishReason !== "FINISH_REASON_STOP") {
      console.warn("[Gemini stream] reply ended early — may be cut off mid-sentence", {
        finishReason,
        model,
        maxOutputTokens: config.maxOutputTokens
      });
    }
    return;
  }

  // Every model in the chain failed before producing a chunk.
  if (lastError) throw lastError;
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

export async function* streamGeminiResponse({ apiKey, model, messages, settings = {}, client } = {}) {
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
    const ai = client || geminiClient(key, settings);

    // Voice calls tolerate no dead air: run a model fallback chain with a first-token watchdog.
    if (settings.voiceMode) {
      yield* streamGeminiVoiceWithFallback({ ai, selectedModel, userMessages, systemMessage, settings });
      return;
    }

    const createStream = () => ai.models.generateContentStream({
      model: selectedModel,
      contents: userMessages,
      config: {
        systemInstruction: systemMessage || undefined,
        ...geminiConfig(settings)
      }
    });
    const firstTokenTimeoutMs = settings.firstTokenTimeoutMs || 4000;

    let finishReason = null;
    for await (const chunk of streamWithFirstTokenWatchdog(createStream, { timeoutMs: firstTokenTimeoutMs, model: selectedModel })) {
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
