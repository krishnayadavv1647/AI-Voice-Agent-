import { hasCommonNonLLMPattern } from "../modelClassification.service.js";

const GROQ_CHAT_PATTERNS = [
  /^llama-/i,
  /^meta-llama\//i,
  /^mistral-/i,
  /mixtral/i,
  /gemma/i,
  /qwen/i,
  /deepseek/i,
  /moonshot/i,
  /compound-beta/i
];

const GROQ_EXCLUDED_PATTERNS = [
  /whisper/i,
  /orpheus/i,
  /tts/i,
  /stt/i,
  /speech/i,
  /audio/i,
  /guard/i,
  /embedding/i,
  /moderation/i
];

export function isGroqChatModelId(modelId) {
  const id = String(modelId || "").trim();
  if (!id) return false;
  if (hasCommonNonLLMPattern(id) || GROQ_EXCLUDED_PATTERNS.some((pattern) => pattern.test(id))) return false;
  return GROQ_CHAT_PATTERNS.some((pattern) => pattern.test(id));
}
