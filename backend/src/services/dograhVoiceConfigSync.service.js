import AgentVoiceConfiguration from "../models/AgentVoiceConfiguration.js";
import Agent from "../models/Agent.js";
import VoiceIntegration from "../models/VoiceIntegration.js";
import { decryptSecret } from "../utils/crypto.js";
import { getDograhClientForAgent } from "./dograhClientResolver.js";
import { extractEffectiveRuntime, extractWorkflowDefinition } from "./dograhWorkflowConfig.service.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function sameValue(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function maskedId(value) {
  const text = String(value || "");
  if (text.length <= 8) return text ? "****" : "";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function safeMessage(error) {
  const status = error?.response?.status || error?.statusCode;
  if (status === 401 || status === 403) return "Dograh rejected the configured credentials.";
  if (status === 404) return "The existing Dograh workflow was not found.";
  if (status === 409) return "Dograh rejected the voice configuration because it conflicts with the current workflow state.";
  if (status === 422) return "Dograh rejected one or more provider, model, voice, or language values.";
  if (status === 429) return "Dograh rate limit reached while syncing voice configuration.";
  return error?.safeMessage || "Dograh voice configuration synchronization failed.";
}

function extractWorkflowConfigurations(payload) {
  const candidates = [
    payload?.workflow_configurations,
    payload?.workflowConfigurations,
    payload?.data?.workflow_configurations,
    payload?.data?.workflowConfigurations,
    payload?.workflow?.workflow_configurations,
    payload?.workflow?.workflowConfigurations,
    payload?.draft?.workflow_configurations,
    payload?.draft?.workflowConfigurations,
    payload?.data?.draft?.workflow_configurations,
    payload?.data?.draft?.workflowConfigurations,
    payload?.released_definition?.workflow_configurations,
    payload?.releasedDefinition?.workflowConfigurations
  ];
  return { ...asObject(candidates.find((item) => item && typeof item === "object")) };
}

function workflowName(payload) {
  return (
    payload?.name ||
    payload?.workflow_name ||
    payload?.workflowName ||
    payload?.data?.name ||
    payload?.data?.workflow_name ||
    payload?.data?.workflowName ||
    payload?.workflow?.name ||
    ""
  );
}

function readTtsEffectiveFromObject(value) {
  const object = asObject(value);
  if (!Object.keys(object).length) return null;

  return {
    provider: object.provider || object.ttsProvider || object.service || "",
    model: object.model || object.model_id || object.modelId || object.ttsModel || "",
    voiceId: object.voice || object.voice_id || object.voiceId || object.ttsVoiceId || object.id || ""
  };
}

function effectiveMatches(expected, actual) {
  if (expected.ttsProvider === "dograh_default") return !actual?.provider || sameValue(actual.provider, "dograh_default");
  return (
    sameValue(actual?.provider, expected.ttsProvider) &&
    sameValue(actual?.model, expected.ttsModel) &&
    sameValue(actual?.voiceId, expected.ttsVoiceId)
  );
}

function sttEffectiveMatches(expected, actual) {
  if (expected.sttProvider === "dograh_default") return true;
  return (
    sameValue(actual?.provider, expected.sttProvider) &&
    sameValue(actual?.model, expected.sttModel)
  );
}

function v2TtsKeysScore(key, value) {
  const lower = String(key || "").toLowerCase();
  const object = asObject(value);
  let score = 0;

  if (["tts", "text_to_speech", "texttospeech", "speech_synthesis", "speechsynthesis", "synthesizer"].includes(lower)) score += 4;
  if (lower.includes("tts") || lower.includes("voice") || lower.includes("speech")) score += 2;
  if ("provider" in object || "model" in object || "model_id" in object || "modelId" in object) score += 2;
  if ("voice" in object || "voice_id" in object || "voiceId" in object || "ttsVoiceId" in object) score += 2;

  return score;
}

function findV2TtsPath(root) {
  const seen = new Set();
  let best = null;

  function visit(value, path) {
    if (!value || typeof value !== "object" || Array.isArray(value) || seen.has(value)) return;
    seen.add(value);

    for (const [key, child] of Object.entries(value)) {
      if (!child || typeof child !== "object" || Array.isArray(child)) continue;
      const score = v2TtsKeysScore(key, child);
      if (score >= 6 && (!best || score > best.score)) best = { path: [...path, key], score };
      visit(child, [...path, key]);
    }
  }

  visit(root, []);
  return best?.path || null;
}

function getAtPath(root, path) {
  return path.reduce((current, key) => asObject(current)[key], root);
}

function setAtPath(root, path, value) {
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    current[path[index]] = asObject(current[path[index]]);
    current = current[path[index]];
  }
  current[path[path.length - 1]] = value;
}

function mergeTtsIntoExisting(existingTts, override) {
  const next = { ...asObject(existingTts), ...override };

  if ("voice_id" in asObject(existingTts)) next.voice_id = override.voice;
  if ("voiceId" in asObject(existingTts)) next.voiceId = override.voice;
  if ("model_id" in asObject(existingTts)) next.model_id = override.model;
  if ("modelId" in asObject(existingTts)) next.modelId = override.model;

  return compact(next);
}

function extractEffectiveTts(existingConfigurations) {
  const legacy = readTtsEffectiveFromObject(existingConfigurations?.model_overrides?.tts);
  if (legacy?.provider || legacy?.model || legacy?.voiceId) return legacy;

  const v2 = asObject(existingConfigurations?.model_configuration_v2_override);
  const path = findV2TtsPath(v2);
  if (!path) return null;
  return readTtsEffectiveFromObject(getAtPath(v2, path));
}

async function integrationCredential(integrationId, userId, expectedProvider) {
  if (!integrationId) return null;
  const integration = await VoiceIntegration.findOne({ _id: integrationId, userId }).select("+apiKeyEncrypted");
  if (!integration?.apiKeyEncrypted || integration.credentialStatus !== "connected") return null;
  if (expectedProvider && integration.provider !== expectedProvider) return null;
  return {
    id: integration._id,
    provider: integration.provider,
    apiKey: decryptSecret(integration.apiKeyEncrypted)
  };
}

function buildSttOverride(config, credential) {
  if (config.sttProvider === "dograh_default") return null;
  if (!credential?.apiKey) {
    const error = new Error(`A connected ${config.sttProvider} credential is required for Dograh STT sync.`);
    error.safeMessage = error.message;
    throw error;
  }

  if (config.sttProvider === "deepgram") {
    return compact({
      provider: "deepgram",
      api_key: credential.apiKey,
      model: config.sttModel || "nova-3-general",
      language: config.sttLanguage || "multi"
    });
  }

  if (config.sttProvider === "cartesia") {
    return {
      provider: "cartesia",
      api_key: credential.apiKey,
      model: config.sttModel || "ink-whisper"
    };
  }

  const error = new Error("The selected STT provider is not supported by the Dograh synchronization adapter.");
  error.safeMessage = error.message;
  throw error;
}

function buildTtsOverride(config, credential) {
  if (config.ttsProvider === "dograh_default") return null;
  if (!credential?.apiKey) {
    const error = new Error(`A connected ${config.ttsProvider} credential is required for Dograh TTS sync.`);
    error.safeMessage = error.message;
    throw error;
  }
  if (!config.ttsVoiceId) {
    const error = new Error("A voice ID or Deepgram Aura model is required for Dograh TTS sync.");
    error.safeMessage = error.message;
    throw error;
  }

  const speed = finiteNumber(config.ttsSettings?.speed, 1, 0.5, 2);

  if (config.ttsProvider === "deepgram") {
    return {
      provider: "deepgram",
      api_key: credential.apiKey,
      voice: config.ttsVoiceId
    };
  }

  if (config.ttsProvider === "elevenlabs") {
    return compact({
      provider: "elevenlabs",
      api_key: credential.apiKey,
      voice: config.ttsVoiceId,
      model: config.ttsModel || "eleven_flash_v2_5",
      speed
    });
  }

  if (config.ttsProvider === "cartesia") {
    return compact({
      provider: "cartesia",
      api_key: credential.apiKey,
      model: config.ttsModel || "sonic-3.5",
      voice: config.ttsVoiceId,
      speed,
      volume: finiteNumber(config.ttsSettings?.volume, 1, 0.5, 2)
    });
  }

  const error = new Error("The selected TTS provider is not supported by the Dograh synchronization adapter.");
  error.safeMessage = error.message;
  throw error;
}

function mergeModelOverrides(existingConfigurations, config, credentials) {
  const ttsOverride = buildTtsOverride(config, credentials.tts);

  if (existingConfigurations.model_configuration_v2_override) {
    const nextConfigurations = { ...existingConfigurations };
    const v2 = { ...asObject(existingConfigurations.model_configuration_v2_override) };
    const ttsPath = findV2TtsPath(v2);

    if (!ttsPath) {
      const error = new Error(
        "This Dograh workflow uses Model Configuration V2, but no recognizable TTS configuration object was found for a safe selective update."
      );
      error.safeMessage = error.message;
      error.configurationRequired = true;
      throw error;
    }

    if (ttsOverride) {
      const existingTts = getAtPath(v2, ttsPath);
      setAtPath(v2, ttsPath, mergeTtsIntoExisting(existingTts, ttsOverride));
    } else {
      const existingTts = { ...asObject(getAtPath(v2, ttsPath)) };
      for (const key of ["provider", "api_key", "model", "model_id", "modelId", "voice", "voice_id", "voiceId", "speed", "volume"]) {
        delete existingTts[key];
      }
      setAtPath(v2, ttsPath, existingTts);
    }

    nextConfigurations.model_configuration_v2_override = v2;
    return nextConfigurations;
  }

  if (existingConfigurations.modelConfigurationV2Override) {
    const error = new Error(
      "This Dograh workflow returned camelCase Model Configuration V2. Please confirm the deployed Dograh update schema before automatic BYOK synchronization."
    );
    error.safeMessage = error.message;
    error.configurationRequired = true;
    throw error;
  }

  const existingOverrides = { ...asObject(existingConfigurations.model_overrides) };
  const sttOverride = buildSttOverride(config, credentials.stt);

  if (sttOverride) existingOverrides.stt = sttOverride;
  else delete existingOverrides.stt;

  if (ttsOverride) existingOverrides.tts = ttsOverride;
  else delete existingOverrides.tts;

  const nextConfigurations = { ...existingConfigurations };
  if (Object.keys(existingOverrides).length) nextConfigurations.model_overrides = existingOverrides;
  else delete nextConfigurations.model_overrides;

  return nextConfigurations;
}

function debugSync(event) {
  console.log("[Dograh Voice Sync]", compact(event));
}

async function markRuntimeStatus(integrationIds, status, safeError = "") {
  const ids = integrationIds.filter(Boolean);
  if (!ids.length) return;
  await VoiceIntegration.updateMany(
    { _id: { $in: ids } },
    { $set: { runtimeStatus: status, lastErrorSafeMessage: safeError } }
  );
}

export async function syncAgentVoiceConfigurationToDograh({ agent, userId }) {
  const config = await AgentVoiceConfiguration.findOne({ agentId: agent._id, userId });
  if (!config || agent.provider !== "dograh") return config;

  const workflowId = agent.dograhWorkflowId || agent.providerWorkflowId;
  if (!workflowId) {
    config.dograhSyncStatus = "pending";
    config.dograhSyncError = "Dograh workflow must exist before voice settings can be synchronized.";
    await config.save();
    return config;
  }

  config.dograhSyncStatus = "syncing";
  config.dograhSyncError = "";
  config.dograhEffectiveSttProvider = "";
  config.dograhEffectiveSttModel = "";
  config.dograhEffectiveTtsProvider = "";
  config.dograhEffectiveTtsModel = "";
  config.dograhEffectiveTtsVoiceId = "";
  await config.save();

  try {
    const [stt, tts] = await Promise.all([
      integrationCredential(config.sttIntegrationId, userId, config.sttProvider),
      integrationCredential(config.ttsIntegrationId, userId, config.ttsProvider)
    ]);

    const resolved = await getDograhClientForAgent(agent, userId);
    const current = await resolved.client.get(`/workflow/fetch/${encodeURIComponent(workflowId)}`);
    const existingConfigurations = extractWorkflowConfigurations(current.data);
    const workflowConfigurations = mergeModelOverrides(existingConfigurations, config, { stt, tts });

    debugSync({
      localAgentId: String(agent._id),
      dograhWorkflowId: workflowId,
      provider: config.ttsProvider,
      model: config.ttsModel,
      maskedVoiceId: maskedId(config.ttsVoiceId),
      syncStep: "update_request"
    });

    const updatePayload = {
      workflow_configurations: workflowConfigurations
    };
    const preservedDefinition = extractWorkflowDefinition(current.data);
    const preservedName = workflowName(current.data);
    if (preservedDefinition) updatePayload.workflow_definition = preservedDefinition;
    if (preservedName) updatePayload.name = preservedName;

    const update = await resolved.client.put(`/workflow/${encodeURIComponent(workflowId)}`, updatePayload);

    const verified = await resolved.client.get(`/workflow/fetch/${encodeURIComponent(workflowId)}`);
    const verifiedConfigurations = extractWorkflowConfigurations(verified.data);
    const effectiveRuntime = extractEffectiveRuntime(verified.data);
    const effectiveTts = effectiveRuntime.tts || extractEffectiveTts(verifiedConfigurations) || {};
    const effectiveStt = effectiveRuntime.stt || {};
    const expectedModel = config.ttsProvider === "cartesia" && !config.ttsModel ? "sonic-3.5" : config.ttsModel;
    const expectedSttModel = config.sttProvider === "deepgram" && !config.sttModel ? "nova-3-general" : config.sttModel;
    const expected = { ...config.toObject(), ttsModel: expectedModel, sttModel: expectedSttModel };
    const verificationResult = effectiveMatches(expected, effectiveTts) && sttEffectiveMatches(expected, effectiveStt);

    debugSync({
      localAgentId: String(agent._id),
      dograhWorkflowId: workflowId,
      provider: config.ttsProvider,
      model: expectedModel,
      maskedVoiceId: maskedId(config.ttsVoiceId),
      effectiveSttProvider: effectiveStt.provider,
      effectiveSttModel: effectiveStt.model,
      syncStep: "read_back_verification",
      dograhStatusCode: update.status,
      verificationResult
    });

    if (!verificationResult) {
      const error = new Error("Dograh accepted the update request, but read-back verification did not show the selected STT/TTS provider, model, and voice.");
      error.safeMessage = error.message;
      error.configurationRequired = true;
      throw error;
    }

    config.dograhSyncStatus = "synced";
    config.dograhLastSyncedAt = new Date();
    config.dograhSyncError = "";
    config.dograhEffectiveSttProvider = config.sttProvider === "dograh_default" ? "dograh_default" : effectiveStt.provider || "";
    config.dograhEffectiveSttModel = config.sttProvider === "dograh_default" ? "" : effectiveStt.model || "";
    config.dograhEffectiveTtsProvider = effectiveTts.provider || "";
    config.dograhEffectiveTtsModel = effectiveTts.model || "";
    config.dograhEffectiveTtsVoiceId = effectiveTts.voiceId || "";
    await config.save();
    await Agent.updateOne(
      { _id: agent._id, userId },
      { $unset: { dograhEmbedToken: "" }, $set: { dograhWidgetEnabled: false } }
    );
    await markRuntimeStatus([stt?.id, tts?.id], "supported");
    return config;
  } catch (error) {
    const message = safeMessage(error);
    config.dograhSyncStatus = error?.configurationRequired ? "configuration_required" : "failed";
    config.dograhSyncError = message;
    config.dograhEffectiveSttProvider = "";
    config.dograhEffectiveSttModel = "";
    config.dograhEffectiveTtsProvider = "";
    config.dograhEffectiveTtsModel = "";
    config.dograhEffectiveTtsVoiceId = "";
    await config.save();
    await markRuntimeStatus(
      [config.sttIntegrationId, config.ttsIntegrationId],
      error?.configurationRequired ? "configuration_required" : "sync_failed",
      message
    );
    return config;
  }
}

export async function getDograhVoiceRuntimeSummary({ agent, userId }) {
  const config = await AgentVoiceConfiguration.findOne({ agentId: agent._id, userId });
  const requiresSync = Boolean(config && (
    (config.ttsProvider && config.ttsProvider !== "dograh_default") ||
    (config.sttProvider && config.sttProvider !== "dograh_default")
  ));

  return {
    requiresSync,
    dograhSyncStatus: config?.dograhSyncStatus || (requiresSync ? "not_configured" : "synced"),
    dograhSyncError: config?.dograhSyncError || "",
    configuredTtsProvider: config?.ttsProvider || "dograh_default",
    configuredSttProvider: config?.sttProvider || "dograh_default",
    configuredSttModel: config?.sttModel || "",
    configuredTtsModel: config?.ttsModel || "",
    configuredTtsVoiceId: config?.ttsVoiceId || "",
    effectiveSttProvider: config?.dograhEffectiveSttProvider || (requiresSync ? "" : "dograh_default"),
    effectiveSttModel: config?.dograhEffectiveSttModel || "",
    effectiveTtsProvider: config?.dograhEffectiveTtsProvider || (requiresSync ? "" : "dograh_default"),
    effectiveTtsModel: config?.dograhEffectiveTtsModel || "",
    effectiveTtsVoiceId: config?.dograhEffectiveTtsVoiceId || "",
    lastVerifiedAt: config?.dograhLastSyncedAt || null
  };
}

export async function assertDograhVoiceReadyForWebCall({ agent, userId }) {
  const runtime = await getDograhVoiceRuntimeSummary({ agent, userId });
  if (runtime.requiresSync && runtime.dograhSyncStatus !== "synced") {
    const error = new Error(runtime.dograhSyncError || "Dograh voice settings are not verified yet.");
    error.safeMessage = "Web calling is waiting for Dograh voice synchronization. Save the agent and wait until the voice status is synced.";
    error.configurationRequired = true;
    error.runtime = runtime;
    throw error;
  }
  return runtime;
}
