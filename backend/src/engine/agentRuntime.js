import mongoose from "mongoose";
import { generateLLMResponse, generateLLMResponseStream } from "../llm/index.js";
import { getConversationHistory, saveConversationMessage } from "./memoryService.js";
import { buildAgentMessages } from "./promptBuilder.js";
import { runWorkflowNode } from "./workflowRunner.js";
import AgentLLMConfiguration from "../models/AgentLLMConfiguration.js";
import LLMIntegration from "../models/LLMIntegration.js";
import { decryptSecret } from "../utils/crypto.js";
import { normalizeLLMProvider } from "../services/llmProviders/providerIdentity.service.js";
import { isDefaultSystem } from "../services/apiKeyMode.service.js";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
// Voice calls default to Flash-Lite for the lowest time-to-first-token. Only used as a
// last-resort fallback: an agent's configured model and GEMINI_MODEL still win.
const DEFAULT_VOICE_GEMINI_MODEL = "gemini-2.5-flash-lite";
const VOICE_HISTORY_LIMIT = 6;
// The resolved LLM config (provider, key, model, settings) does not change during a
// call, but resolving it costs two sequential DB reads. Cache it briefly per agent so
// only the first turn pays that cost; later turns start the LLM stream immediately.
const RUNTIME_CONFIG_CACHE_TTL_MS = 30000;
const RUNTIME_CONFIG_CACHE_MAX = 500;
const runtimeConfigCache = new Map();

// Expired entries are ignored on read but never deleted, so sweep periodically to bound memory on
// a small instance. Unref'd so it never keeps the process alive during shutdown.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of runtimeConfigCache) {
    if (entry.expiresAt <= now) runtimeConfigCache.delete(key);
  }
}, 60 * 1000).unref();

function dbAvailable() {
  return mongoose.connection?.readyState === 1;
}

function runtimeConfigCacheKey(agent, voiceMode) {
  const id = agent?._id?.toString?.() || agent?._id;
  return id ? `${id}:${voiceMode ? "voice" : "text"}` : null;
}

async function resolveAgentLLMRuntimeConfigCached({ agent, voiceMode }) {
  const key = runtimeConfigCacheKey(agent, voiceMode);
  if (!key) return resolveAgentLLMRuntimeConfig({ agent, voiceMode });

  const cached = runtimeConfigCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  const config = await resolveAgentLLMRuntimeConfig({ agent, voiceMode });
  if (runtimeConfigCache.size >= RUNTIME_CONFIG_CACHE_MAX) {
    runtimeConfigCache.delete(runtimeConfigCache.keys().next().value);
  }
  runtimeConfigCache.set(key, { config, expiresAt: Date.now() + RUNTIME_CONFIG_CACHE_TTL_MS });
  return config;
}

export function clearRuntimeConfigCache() {
  runtimeConfigCache.clear();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function numberSetting(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

// Voice replies target 45-80 words (~110-150 tokens). The old 180 ceiling let Gemini
// hit MAX_TOKENS and cut off mid-sentence, so give enough headroom that a full spoken
// reply always fits. This ceiling does not affect time-to-first-token (streaming caps
// length, not start latency), so it is safe for the sub-3s goal.
export function clampVoiceMaxTokens(value, fallback = 200) {
  const selected = numberSetting(value, fallback) ?? fallback;
  return Math.min(Math.max(selected, 80), 400);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function envKeyForProvider(provider) {
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  return process.env.GEMINI_API_KEY;
}

function envModelForProvider(provider, voiceMode = false) {
  if (provider === "openai") return process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (voiceMode) {
    return process.env.GEMINI_VOICE_MODEL || process.env.GEMINI_MODEL || DEFAULT_VOICE_GEMINI_MODEL;
  }
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

function normalizeRuntimeProvider(value) {
  const provider = normalizeLLMProvider(value === "platform_default" ? "google_gemini" : value);
  return provider === "platform_default" ? "google_gemini" : provider;
}

function agentHasExecutableTools(agent) {
  return [
    agent?.tools,
    agent?.workflowNodes,
    agent?.nodes,
    agent?.actions,
    agent?.bookingApis,
    agent?.settings?.tools,
    agent?.settings?.actions
  ].some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value && typeof value === "object" && Object.keys(value).length));
}

function resolveToolCalling({ agent, agentLLMSettings, savedSettings, voiceMode }) {
  const requested = firstDefined(agentLLMSettings.toolCalling, savedSettings.toolCalling, voiceMode ? false : true) === true;
  if (!voiceMode) return requested;

  const enabled = requested && agentHasExecutableTools(agent);
  console.log("[Vapi LLM config] toolCalling=" + String(enabled), {
    agentId: agent?._id?.toString?.() || agent?._id
  });
  if (enabled) console.warn("[Vapi warning] Tool calling may increase call latency.");
  return enabled;
}

async function loadSavedLLMConfiguration(agent) {
  if (!dbAvailable() || !agent?._id) return null;
  try {
    return await AgentLLMConfiguration.findOne({ agentId: agent._id, userId: agent.userId });
  } catch (error) {
    console.error("[Vapi LLM config] saved config lookup failed:", error.message);
    return null;
  }
}

async function resolveConnectedAccountApiKey({ agent, config, provider }) {
  if (!dbAvailable() || !config?.integrationId || !agent?.userId) return null;

  try {
    const integration = await LLMIntegration.findOne({
      _id: config.integrationId,
      userId: agent.userId,
      provider,
      credentialStatus: "connected"
    }).select("+encryptedCredentials");

    if (!integration?.encryptedCredentials) return null;
    const credentials = JSON.parse(decryptSecret(integration.encryptedCredentials));
    return String(credentials?.apiKey || "").trim() || null;
  } catch (error) {
    console.error("[Vapi LLM config] connected account lookup failed:", error.message);
    return null;
  }
}

export async function resolveAgentLLMRuntimeConfig({
  agent,
  voiceMode = false,
  savedConfigOverride,
  connectedApiKeyOverride,
  skipDb = false
} = {}) {
  const savedConfig = savedConfigOverride !== undefined
    ? savedConfigOverride
    : skipDb
      ? null
      : await loadSavedLLMConfiguration(agent);
  const agentLLMSettings = asObject(agent?.settings?.llm);
  const savedSettings = asObject(savedConfig?.settings);
  const provider = normalizeRuntimeProvider(firstDefined(
    agentLLMSettings.provider,
    savedConfig?.provider,
    agent?.llmProvider,
    process.env.DEFAULT_LLM_PROVIDER,
    "google_gemini"
  ));

  const selectedModel = firstDefined(
    agentLLMSettings.manualModelId,
    agentLLMSettings.model,
    savedConfig?.model,
    agent?.llmModel,
    envModelForProvider(provider, voiceMode)
  );

  if (voiceMode && /pro/i.test(String(selectedModel || ""))) {
    console.warn("Gemini Pro is not recommended for voice calls due to latency.");
  }

  // DEFAULT SYSTEM mode: ignore the user's connected key and use the platform env key.
  // This is NOT a silent fallback — the user explicitly chose Default System, so this is intended.
  // (For BYOK agents the "call must not start on a broken key" enforcement already ran in the
  // outbound pre-flight; this runtime guard only stops default_system picking up a user key.)
  const useDefaultSystem = isDefaultSystem(agent);
  const connectedApiKey = useDefaultSystem
    ? null
    : (connectedApiKeyOverride !== undefined
        ? connectedApiKeyOverride
        : skipDb
          ? null
          : await resolveConnectedAccountApiKey({ agent, config: savedConfig, provider }));
  const apiKey = connectedApiKey || String(envKeyForProvider(provider) || "").trim();
  console.log(
    useDefaultSystem
      ? "[LLM config] default_system mode -> env platform key"
      : connectedApiKey
        ? "[LLM config] byok mode -> agent connected account"
        : "[LLM config] byok mode but connected key unresolved",
    {
      agentId: agent?._id?.toString?.() || agent?._id,
      provider,
      model: selectedModel
    }
  );

  const temperature = numberSetting(
    agentLLMSettings.temperature,
    savedSettings.temperature,
    process.env.GEMINI_TEMPERATURE,
    voiceMode ? 0.35 : 0.3
  ) ?? (voiceMode ? 0.35 : 0.3);

  const configuredMaxTokens = firstDefined(
    agentLLMSettings.maxTokens,
    savedSettings.maxTokens,
    process.env.GEMINI_MAX_TOKENS
  );
  const maxTokens = voiceMode
    ? clampVoiceMaxTokens(configuredMaxTokens, 200)
    : (numberSetting(configuredMaxTokens, 512) ?? 512);
  const toolCalling = resolveToolCalling({ agent, agentLLMSettings, savedSettings, voiceMode });

  return {
    provider,
    apiKey,
    model: selectedModel,
    settings: {
      ...savedSettings,
      ...agentLLMSettings,
      temperature,
      maxTokens,
      maxOutputTokens: maxTokens,
      topP: numberSetting(agentLLMSettings.topP, savedSettings.topP),
      timeoutMs: numberSetting(agentLLMSettings.timeoutMs, savedSettings.timeoutMs, 30000),
      streaming: firstDefined(agentLLMSettings.streaming, savedSettings.streaming, true) !== false,
      toolCalling,
      voiceMode
    }
  };
}

export async function runCustomAgent({ agent, userMessage, conversationId }) {
  const history = await getConversationHistory(conversationId);
  const workflowState = runWorkflowNode({ agent, userMessage });
  const messages = buildAgentMessages({ agent, userMessage, history });
  const llmConfig = await resolveAgentLLMRuntimeConfig({ agent, voiceMode: false });

  const reply = await generateLLMResponse({
    provider: llmConfig.provider,
    apiKey: llmConfig.apiKey,
    model: llmConfig.model,
    messages,
    settings: llmConfig.settings
  });

  await saveConversationMessage(conversationId, { role: "user", content: userMessage });
  await saveConversationMessage(conversationId, { role: "assistant", content: reply });

  return {
    reply,
    workflowState
  };
}

export async function* runCustomAgentStream({ agent, userMessage, conversationId, voiceMode = true }) {
  // History and config are independent; resolve them concurrently so their DB reads
  // overlap instead of stacking up in front of the first LLM token.
  const [history, llmConfig] = await Promise.all([
    getConversationHistory(conversationId, voiceMode ? VOICE_HISTORY_LIMIT : undefined),
    resolveAgentLLMRuntimeConfigCached({ agent, voiceMode })
  ]);
  const messages = buildAgentMessages({ agent, userMessage, history, voiceMode });
  let assistantReply = "";
  let emitted = false;

  try {
    for await (const chunk of generateLLMResponseStream({
      provider: llmConfig.provider,
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      messages,
      settings: llmConfig.settings
    })) {
      emitted = true;
      assistantReply += chunk;
      yield chunk;
    }
  } catch (error) {
    if (!emitted) throw error;
    console.error("[agentRuntime] LLM stream failed after partial output:", {
      agentId: agent?._id?.toString?.() || agent?._id,
      conversationId,
      message: error.message
    });
  } finally {
    // Don't block the SSE close on Mongo writes — persist in the background.
    Promise.all([
      saveConversationMessage(conversationId, { role: "user", content: userMessage }),
      assistantReply
        ? saveConversationMessage(conversationId, { role: "assistant", content: assistantReply })
        : Promise.resolve()
    ]).catch((error) => {
      console.error("[agentRuntime] history save failed:", { conversationId, message: error.message });
    });
  }
}
