import AgentVoiceConfiguration from "../models/AgentVoiceConfiguration.js";
import VoiceIntegration from "../models/VoiceIntegration.js";
import { ApiError } from "../utils/apiError.js";

// "platform_default" is the platform-provided voice (no BYOK integration required); Vapi resolves
// it to ElevenLabs (TTS) / Deepgram (STT) at assistant-build time.
const PROVIDERS = ["platform_default", "cartesia", "elevenlabs", "deepgram"];
const STT_PROVIDERS = ["platform_default", "cartesia", "deepgram"];

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanString(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function nullableObjectId(value) {
  if (!value) return null;
  return value;
}

export function defaultVoiceConfigurationForAgent(agent) {
  const legacyStt = String(agent?.sttProvider || "").toLowerCase();
  const legacyTts = String(agent?.ttsProvider || agent?.voiceProvider || "").toLowerCase();
  const sttProvider = STT_PROVIDERS.includes(legacyStt) ? legacyStt : "platform_default";
  const ttsProvider = PROVIDERS.includes(legacyTts) ? legacyTts : "platform_default";

  return {
    sttIntegrationId: null,
    sttProvider,
    sttModel: cleanString(agent?.sttModel),
    sttLanguage: cleanString(agent?.sttLanguage || agent?.language || "en", 40),
    sttSettings: asObject(agent?.sttSettings),
    ttsIntegrationId: null,
    ttsProvider,
    ttsModel: cleanString(agent?.ttsModel),
    ttsVoiceId: cleanString(agent?.voiceId, 300),
    ttsLanguage: cleanString(agent?.ttsLanguage || agent?.language || "en", 40),
    ttsSettings: {
      speed: agent?.speakingSpeed === "Fast" ? 1.15 : agent?.speakingSpeed === "Slow" ? 0.85 : 1,
      ...asObject(agent?.ttsSettings)
    }
  };
}

export function sanitizeVoiceConfiguration(input = {}, agent) {
  const defaults = defaultVoiceConfigurationForAgent(agent);
  const sttProvider = cleanString(input.sttProvider || defaults.sttProvider, 40).toLowerCase();
  const ttsProvider = cleanString(input.ttsProvider || defaults.ttsProvider, 40).toLowerCase();

  if (!STT_PROVIDERS.includes(sttProvider)) throw new ApiError(400, "Selected STT provider is not supported.");
  if (!PROVIDERS.includes(ttsProvider)) throw new ApiError(400, "Selected TTS provider is not supported.");

  return {
    sttIntegrationId: nullableObjectId(input.sttIntegrationId),
    sttProvider,
    sttModel: cleanString(input.sttModel || defaults.sttModel),
    sttLanguage: cleanString(input.sttLanguage || defaults.sttLanguage || "en", 40),
    sttSettings: {
      endpointing: Number(input.sttSettings?.endpointing ?? defaults.sttSettings?.endpointing ?? 300),
      interimResults: input.sttSettings?.interimResults !== false,
      smartFormat: input.sttSettings?.smartFormat !== false,
      punctuation: input.sttSettings?.punctuation !== false,
      silenceTimeout: Number(input.sttSettings?.silenceTimeout ?? defaults.sttSettings?.silenceTimeout ?? 1000)
    },
    ttsIntegrationId: nullableObjectId(input.ttsIntegrationId),
    ttsProvider,
    ttsModel: cleanString(input.ttsModel || defaults.ttsModel),
    ttsVoiceId: cleanString(input.ttsVoiceId ?? input.voiceId ?? defaults.ttsVoiceId, 300),
    ttsLanguage: cleanString(input.ttsLanguage || defaults.ttsLanguage || "en", 40),
    ttsSettings: {
      speed: Number(input.ttsSettings?.speed ?? defaults.ttsSettings?.speed ?? 1),
      stability: Number(input.ttsSettings?.stability ?? defaults.ttsSettings?.stability ?? 0.5),
      similarityBoost: Number(input.ttsSettings?.similarityBoost ?? defaults.ttsSettings?.similarityBoost ?? 0.75),
      volume: Number(input.ttsSettings?.volume ?? defaults.ttsSettings?.volume ?? 1),
      emotion: cleanString(input.ttsSettings?.emotion || defaults.ttsSettings?.emotion, 80),
      outputEncoding: cleanString(input.ttsSettings?.outputEncoding || defaults.ttsSettings?.outputEncoding || "", 60),
      sampleRate: Number(input.ttsSettings?.sampleRate ?? defaults.ttsSettings?.sampleRate ?? 0) || null
    }
  };
}

async function validateIntegration({ integrationId, provider, userId, type }) {
  if (provider === "platform_default") return null;
  if (!integrationId) throw new ApiError(400, `Connect ${provider} before selecting it as the ${type.toUpperCase()} provider.`);

  const integration = await VoiceIntegration.findOne({
    _id: integrationId,
    userId,
    provider,
    credentialStatus: "connected"
  });
  if (!integration) throw new ApiError(400, `Connected ${provider} integration was not found for this user.`);
  return integration;
}

export async function validateVoiceConfigurationOwnership({ userId, config }) {
  const [sttIntegration, ttsIntegration] = await Promise.all([
    validateIntegration({
      integrationId: config.sttIntegrationId,
      provider: config.sttProvider,
      userId,
      type: "stt"
    }),
    validateIntegration({
      integrationId: config.ttsIntegrationId,
      provider: config.ttsProvider,
      userId,
      type: "tts"
    })
  ]);

  if (config.ttsProvider !== "platform_default" && !config.ttsVoiceId) {
    throw new ApiError(400, "A voice ID or Deepgram Aura model is required for the selected TTS provider.");
  }

  return { sttIntegration, ttsIntegration };
}

export function applyVoiceConfigurationToAgent(agent, config) {
  agent.sttProvider = config.sttProvider;
  agent.sttModel = config.sttModel;
  agent.sttLanguage = config.sttLanguage;
  agent.sttSettings = config.sttSettings;
  agent.ttsProvider = config.ttsProvider;
  agent.ttsModel = config.ttsModel;
  agent.ttsLanguage = config.ttsLanguage;
  agent.ttsSettings = config.ttsSettings;
  agent.voiceProvider = config.ttsProvider === "platform_default"
    ? "Platform Default"
    : config.ttsProvider === "elevenlabs"
      ? "ElevenLabs"
      : config.ttsProvider[0].toUpperCase() + config.ttsProvider.slice(1);
  agent.voiceId = config.ttsVoiceId;
  agent.voiceSpeed = String(config.ttsSettings?.speed || 1);
}

export async function upsertAgentVoiceConfiguration({ userId, agent, input, markPending = true }) {
  const config = sanitizeVoiceConfiguration(input || {}, agent);
  await validateVoiceConfigurationOwnership({ userId, config });
  applyVoiceConfigurationToAgent(agent, config);

  return AgentVoiceConfiguration.findOneAndUpdate(
    { agentId: agent._id, userId },
    {
      $set: {
        ...config,
        userId,
        agentId: agent._id
      }
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

export async function getAgentVoiceConfiguration({ userId, agent }) {
  const saved = await AgentVoiceConfiguration.findOne({ agentId: agent._id, userId });
  if (saved) return saved;
  return {
    userId,
    agentId: agent._id,
    ...defaultVoiceConfigurationForAgent(agent)
  };
}
