import { ApiError } from "../../utils/apiError.js";

export const MODEL_TASKS = {
  CHAT: "chat",
  REASONING: "reasoning",
  TEXT_GENERATION: "text_generation",
  EMBEDDING: "embedding",
  MODERATION: "moderation",
  STT: "stt",
  TTS: "tts",
  AUDIO: "audio",
  IMAGE: "image",
  VISION: "vision",
  TRANSLATION: "translation",
  RERANKING: "reranking",
  UNKNOWN: "unknown"
};

export const LLM_MODEL_CACHE_VERSION = "v4";

export const COMMON_NON_LLM_PATTERNS = [
  /whisper/i,
  /transcri/i,
  /speech[-_ ]?to[-_ ]?text/i,
  /text[-_ ]?to[-_ ]?speech/i,
  /tts/i,
  /stt/i,
  /orpheus/i,
  /bulbul/i,
  /saaras/i,
  /embedding/i,
  /embed/i,
  /moderation/i,
  /rerank/i,
  /audio[-_ ]?translation/i,
  /audio[-_ ]?transcription/i,
  /image[-_ ]?generation/i,
  /text[-_ ]?to[-_ ]?image/i,
  /dall[-_ ]?e/i,
  /imagen/i,
  /babbage/i,
  /davinci/i
];

const CHAT_POSITIVE_PATTERNS = [
  /^gpt-/i,
  /^o[134]/i,
  /chat/i,
  /llama/i,
  /mixtral/i,
  /mistral/i,
  /gemma/i,
  /qwen/i,
  /deepseek/i,
  /claude/i,
  /command/i,
  /gemini/i,
  /sarvam-(30b|105b|m)$/i
];

export function invalidLLMModelError() {
  const error = new ApiError(400, "The selected model is not compatible with conversational LLM requests.", {
    code: "INVALID_LLM_MODEL",
    message: "The selected model is not compatible with conversational LLM requests."
  });
  error.code = "INVALID_LLM_MODEL";
  error.status = 400;
  error.safeMessage = error.message;
  error.configurationRequired = true;
  return error;
}

export function taskAwareCacheKey({ provider, integrationId, version = LLM_MODEL_CACHE_VERSION }) {
  return `llm:${provider}:${version}:${integrationId}`;
}

export function normalizeModelId(modelId) {
  return String(modelId || "").trim().replace(/^models\//, "");
}

export function classifyModelTask({ id = "", raw = {}, provider = "" }) {
  const text = [
    id,
    raw.id,
    raw.name,
    raw.displayName,
    raw.description,
    raw.object,
    raw.type,
    raw.task,
    raw.category
  ].filter(Boolean).join(" ").toLowerCase();

  if (/embedding|embed/.test(text)) return { task: MODEL_TASKS.EMBEDDING, reason: "embedding model" };
  if (/moderation/.test(text)) return { task: MODEL_TASKS.MODERATION, reason: "moderation model" };
  if (/whisper|transcri|speech[-_ ]?to[-_ ]?text|saaras|stt/.test(text)) return { task: MODEL_TASKS.STT, reason: "speech-to-text model" };
  if (/text[-_ ]?to[-_ ]?speech|tts|orpheus|bulbul/.test(text)) return { task: MODEL_TASKS.TTS, reason: "text-to-speech model" };
  if (/audio[-_ ]?translation|translation-only/.test(text)) return { task: MODEL_TASKS.TRANSLATION, reason: "translation-only model" };
  if (/audio/.test(text) && !CHAT_POSITIVE_PATTERNS.some((pattern) => pattern.test(text))) return { task: MODEL_TASKS.AUDIO, reason: "audio-only model" };
  if (/image[-_ ]?generation|text[-_ ]?to[-_ ]?image|dall[-_ ]?e|imagen/.test(text)) return { task: MODEL_TASKS.IMAGE, reason: "image-generation model" };
  if (/rerank/.test(text)) return { task: MODEL_TASKS.RERANKING, reason: "reranking model" };
  if (/reason|r1|thinking|o1|o3|o4/.test(text)) return { task: MODEL_TASKS.REASONING, reason: "reasoning model" };
  if (CHAT_POSITIVE_PATTERNS.some((pattern) => pattern.test(text))) return { task: MODEL_TASKS.CHAT, reason: "known chat model pattern" };
  if (provider === "google_gemini" && Array.isArray(raw.supportedGenerationMethods) && raw.supportedGenerationMethods.includes("generateContent")) {
    return { task: MODEL_TASKS.CHAT, reason: "Gemini generateContent support" };
  }
  return { task: MODEL_TASKS.UNKNOWN, reason: "unknown task" };
}

export function hasCommonNonLLMPattern(modelId) {
  return COMMON_NON_LLM_PATTERNS.some((pattern) => pattern.test(String(modelId || "")));
}

export function normalizeLLMModel(partial = {}) {
  const id = normalizeModelId(partial.id);
  const task = partial.task || classifyModelTask({ id, raw: partial.raw || partial, provider: partial.providerId }).task;
  const deprecated = Boolean(partial.deprecated);
  const chatCompletionCompatible = partial.chatCompletionCompatible === true;
  const llmCompatible = partial.llmCompatible === true;
  const recommendedForVoiceAgents = Boolean(partial.recommendedForVoiceAgents ?? partial.recommendedForVoice);

  return {
    id,
    name: partial.name || id,
    description: partial.description || "",
    provider: partial.provider || null,
    task,
    llmCompatible,
    chatCompletionCompatible,
    supportsStreaming: partial.supportsStreaming ?? null,
    supportsTools: partial.supportsTools ?? null,
    supportsJsonMode: partial.supportsJsonMode ?? null,
    supportsVision: partial.supportsVision ?? null,
    supportsAudioInput: partial.supportsAudioInput ?? null,
    contextLength: partial.contextLength ?? null,
    inputPrice: partial.inputPrice ?? null,
    outputPrice: partial.outputPrice ?? null,
    recommendedForVoiceAgents,
    recommendationLabel: partial.recommendationLabel || (recommendedForVoiceAgents ? "Recommended for Voice Agents" : null),
    deprecated,
    legacy: Boolean(partial.legacy),
    source: partial.source || "provider_api",
    category: partial.category || partial.recommendationLabel || (recommendedForVoiceAgents ? "Recommended for Voice Agents" : null),
    recommendedForVoice: recommendedForVoiceAgents
  };
}

export function filterChatModels(models = []) {
  const normalized = models.map((model) => normalizeLLMModel(model));
  const deduped = deduplicateModels(normalized);
  return {
    models: deduped.filter((model) => model.llmCompatible === true && model.chatCompletionCompatible === true && model.deprecated !== true),
    excludedCount: normalized.filter((model) => !(model.llmCompatible === true && model.chatCompletionCompatible === true && model.deprecated !== true)).length
  };
}

export function mergeModelMetadata(current, incoming) {
  return Object.fromEntries(Object.entries({
    ...current,
    ...incoming,
    description: incoming.description || current.description,
    provider: incoming.provider || current.provider,
    category: incoming.category || current.category,
    contextLength: incoming.contextLength || current.contextLength,
    supportsStreaming: incoming.supportsStreaming ?? current.supportsStreaming,
    supportsTools: incoming.supportsTools ?? current.supportsTools,
    supportsJsonMode: incoming.supportsJsonMode ?? current.supportsJsonMode,
    supportsVision: incoming.supportsVision ?? current.supportsVision,
    inputPrice: incoming.inputPrice ?? current.inputPrice,
    outputPrice: incoming.outputPrice ?? current.outputPrice,
    recommendedForVoiceAgents: current.recommendedForVoiceAgents || incoming.recommendedForVoiceAgents,
    recommendedForVoice: current.recommendedForVoice || incoming.recommendedForVoice,
    deprecated: current.deprecated && incoming.deprecated,
    legacy: current.legacy || incoming.legacy
  }).filter(([, value]) => value !== undefined));
}

export function deduplicateModels(models = []) {
  const byId = new Map();
  for (const model of models) {
    const canonicalId = normalizeModelId(model?.id);
    if (!canonicalId) continue;
    const normalized = { ...model, id: canonicalId };
    const current = byId.get(canonicalId);
    byId.set(canonicalId, current ? mergeModelMetadata(current, normalized) : normalized);
  }
  return [...byId.values()];
}

export function positiveChatHeuristic(modelId) {
  const id = String(modelId || "");
  return !hasCommonNonLLMPattern(id) && CHAT_POSITIVE_PATTERNS.some((pattern) => pattern.test(id));
}
