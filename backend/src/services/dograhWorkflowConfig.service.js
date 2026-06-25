import AgentLLMConfiguration from "../models/AgentLLMConfiguration.js";
import AgentVoiceConfiguration from "../models/AgentVoiceConfiguration.js";
import TelephonyConfig from "../models/TelephonyConfig.js";
import { ApiError } from "../utils/apiError.js";
import { findModelConfigPath, getAtPath as getAtConfigPath } from "./dograhModelConfig.service.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function sameValue(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

export function maskVoiceId(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "****";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

export function extractWorkflowConfigurations(payload) {
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

export function extractWorkflowDefinition(payload) {
  const candidates = [
    payload?.workflow_definition,
    payload?.workflowDefinition,
    payload?.data?.workflow_definition,
    payload?.data?.workflowDefinition,
    payload?.workflow?.workflow_definition,
    payload?.workflow?.workflowDefinition,
    payload?.draft?.workflow_definition,
    payload?.draft?.workflowDefinition,
    payload?.data?.draft?.workflow_definition,
    payload?.data?.draft?.workflowDefinition,
    payload?.released_definition?.workflow_definition,
    payload?.releasedDefinition?.workflowDefinition
  ];
  return candidates.find((item) => item && typeof item === "object") || null;
}

export function extractDograhWorkflowFieldsFromPayload(payload = {}) {
  const workflow =
    payload?.workflow ||
    payload?.data?.workflow ||
    payload?.data?.workflow_data ||
    payload?.workflow_data ||
    payload?.data ||
    {};

  return {
    dograhWorkflowId:
      payload?.id ||
      payload?.workflow_id ||
      payload?.workflowId ||
      payload?.workflowID ||
      payload?.data?.id ||
      payload?.data?.workflow_id ||
      payload?.data?.workflowId ||
      payload?.data?.workflowID ||
      workflow?.id ||
      workflow?.workflow_id ||
      workflow?.workflowId ||
      workflow?.workflowID ||
      null,
    dograhWorkflowUuid:
      payload?.workflow_uuid ||
      payload?.uuid ||
      payload?.workflowUuid ||
      payload?.workflowUUID ||
      payload?.workflow?.uuid ||
      payload?.workflow?.workflow_uuid ||
      payload?.workflow?.workflowUuid ||
      payload?.workflow?.workflowUUID ||
      payload?.data?.workflow_uuid ||
      payload?.data?.uuid ||
      payload?.data?.workflowUuid ||
      payload?.data?.workflowUUID ||
      workflow?.workflow_uuid ||
      workflow?.uuid ||
      workflow?.workflowUuid ||
      workflow?.workflowUUID ||
      null
  };
}

function nodePrompt(node) {
  return String(node?.data?.prompt || node?.prompt || node?.data?.message || node?.message || "").trim();
}

export function startCallPromptExists(payload) {
  const definition = extractWorkflowDefinition(payload);
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  const startNode = nodes.find((node) => node?.type === "startCall" || node?.type === "start_call" || /start/i.test(node?.type || ""));
  return Boolean(startNode && nodePrompt(startNode));
}

function readLLMEffectiveFromObject(value) {
  const object = asObject(value);
  return {
    provider: object.provider || object.llmProvider || object.service || "",
    model: object.model || object.model_id || object.modelId || object.llmModel || ""
  };
}

function readSpeechEffectiveFromObject(value) {
  const object = asObject(value);
  if (!Object.keys(object).length) return null;
  const direct = {
    provider: object.provider || object.provider_id || object.providerId || object.provider_name || object.providerName || object.ttsProvider || object.sttProvider || object.service || "",
    model: object.model || object.model_id || object.modelId || object.model_name || object.modelName || object.ttsModel || object.sttModel || "",
    voiceId: object.voice || object.voice_id || object.voiceId || object.ttsVoiceId || object.voice_model || object.voiceModel || object.id || "",
    language: object.language || object.lang || object.locale || ""
  };
  if (direct.provider || direct.model || direct.voiceId) return direct;

  for (const child of Object.values(object)) {
    if (!child || typeof child !== "object" || Array.isArray(child)) continue;
    const nested = readSpeechEffectiveFromObject(child);
    if (nested?.provider || nested?.model || nested?.voiceId) return nested;
  }

  return direct;
}

// Delegates to the shared resolver so the runtime verifier recognizes exactly the same
// TTS/STT/LLM blocks that the BYOK sync writer detects, patches, or creates.
function findV2Path(root, type) {
  return findModelConfigPath(root, type);
}

function getAtPath(root, path) {
  return getAtConfigPath(root, path);
}

export function extractEffectiveRuntime(payloadOrConfigurations) {
  const configurations = payloadOrConfigurations?.model_overrides || payloadOrConfigurations?.model_configuration_v2_override
    ? asObject(payloadOrConfigurations)
    : extractWorkflowConfigurations(payloadOrConfigurations);
  const v2 = asObject(configurations.model_configuration_v2_override);
  const llmPath = findV2Path(v2, "llm");
  const ttsPath = findV2Path(v2, "tts");
  const sttPath = findV2Path(v2, "stt");
  const llm = readLLMEffectiveFromObject(configurations?.model_overrides?.llm);
  const tts = readSpeechEffectiveFromObject(configurations?.model_overrides?.tts);
  const stt = readSpeechEffectiveFromObject(configurations?.model_overrides?.stt);

  return {
    llm: (llm.provider || llm.model) ? llm : (llmPath ? readLLMEffectiveFromObject(getAtPath(v2, llmPath)) : null),
    tts: tts?.provider || tts?.model || tts?.voiceId ? tts : (ttsPath ? readSpeechEffectiveFromObject(getAtPath(v2, ttsPath)) : null),
    stt: stt?.provider || stt?.model ? stt : (sttPath ? readSpeechEffectiveFromObject(getAtPath(v2, sttPath)) : null)
  };
}

function expectedRuntimeMatches(expected, actual, type) {
  if (!expected || expected.provider === "dograh_default") return true;
  if (!sameValue(actual?.provider, expected.provider)) return false;
  if (expected.model && !sameValue(actual?.model, expected.model)) return false;
  if (type === "tts" && expected.voiceId && !sameValue(actual?.voiceId, expected.voiceId)) return false;
  return true;
}

async function expectedRuntime(agent, userId) {
  const [llmConfig, voiceConfig] = await Promise.all([
    AgentLLMConfiguration.findOne({ agentId: agent._id, userId }),
    AgentVoiceConfiguration.findOne({ agentId: agent._id, userId })
  ]);

  const voiceSyncVerified = voiceConfig?.dograhSyncStatus === "synced";

  return {
    llm: {
      provider: llmConfig?.provider || "dograh_default",
      model: llmConfig?.model || ""
    },
    tts: {
      provider: voiceConfig?.ttsProvider || "dograh_default",
      model: voiceConfig?.ttsProvider === "cartesia" && !voiceConfig?.ttsModel ? "sonic-3.5" : voiceConfig?.ttsModel || "",
      voiceId: voiceConfig?.ttsVoiceId || ""
    },
    stt: {
      provider: voiceConfig?.sttProvider || "dograh_default",
      model: voiceConfig?.sttProvider === "deepgram" && !voiceConfig?.sttModel ? "nova-3-general" : voiceConfig?.sttModel || ""
    },
    effectiveFallback: {
      tts: voiceSyncVerified ? {
        provider: voiceConfig?.dograhEffectiveTtsProvider || "",
        model: voiceConfig?.dograhEffectiveTtsModel || "",
        voiceId: voiceConfig?.dograhEffectiveTtsVoiceId || ""
      } : null,
      stt: voiceSyncVerified ? {
        provider: voiceConfig?.dograhEffectiveSttProvider || "",
        model: voiceConfig?.dograhEffectiveSttModel || ""
      } : null
    }
  };
}

function missingRuntimeMessage(expected, effective, type) {
  if (!expected || expected.provider === "dograh_default") return "";
  if (!effective?.provider) return `${type.toUpperCase()} configuration missing in Dograh workflow.`;
  if (!sameValue(effective.provider, expected.provider)) return `${type.toUpperCase()} provider mismatch in Dograh workflow.`;
  if (expected.model && !sameValue(effective.model, expected.model)) return `${type.toUpperCase()} model mismatch in Dograh workflow.`;
  if (type === "tts" && expected.voiceId && !sameValue(effective.voiceId, expected.voiceId)) return "TTS voice ID mismatch in Dograh workflow.";
  return "";
}

export async function verifyDograhWorkflowRuntime({ agent, userId, workflowPayload, fetchWorkflow, callType = "normal_phone_call" }) {
  const payload = workflowPayload || await fetchWorkflow();
  const fields = extractDograhWorkflowFieldsFromPayload(payload);
  const expected = await expectedRuntime(agent, userId);
  const payloadEffective = extractEffectiveRuntime(payload);
  const effective = {
    llm: payloadEffective.llm,
    tts: payloadEffective.tts || expected.effectiveFallback?.tts || null,
    stt: payloadEffective.stt || expected.effectiveFallback?.stt || null
  };
  const startPromptOk = startCallPromptExists(payload);
  const workflowUuidMatches = !fields.dograhWorkflowUuid || !agent.dograhWorkflowUuid || sameValue(fields.dograhWorkflowUuid, agent.dograhWorkflowUuid);
  const telephonyConfig = agent.telephonyConfigId
    ? await TelephonyConfig.findOne({ _id: agent.telephonyConfigId, userId }).select("phoneNumber linkedAgentId")
    : null;
  const telephonyMatches = !telephonyConfig || !telephonyConfig.linkedAgentId || sameValue(telephonyConfig.linkedAgentId, agent._id);

  const errors = [
    startPromptOk ? "" : "Start Call prompt is missing in Dograh workflow.",
    workflowUuidMatches ? "" : "Dograh workflow UUID does not match the local agent.",
    telephonyMatches ? "" : "Telephony number is linked to another agent or workflow.",
    missingRuntimeMessage(expected.llm, effective.llm, "llm"),
    missingRuntimeMessage(expected.tts, effective.tts, "tts"),
    missingRuntimeMessage(expected.stt, effective.stt, "stt")
  ].filter(Boolean);

  const diagnostics = compact({
    localAgentId: String(agent._id),
    workflowId: agent.dograhWorkflowId || agent.providerWorkflowId || fields.dograhWorkflowId || "",
    workflowUuid: agent.dograhWorkflowUuid || fields.dograhWorkflowUuid || "",
    callType,
    effectiveLlmProvider: effective.llm?.provider || (expected.llm.provider === "dograh_default" ? "dograh_default" : ""),
    effectiveLlmModel: effective.llm?.model || (expected.llm.provider === "dograh_default" ? "dograh_default" : ""),
    effectiveTtsProvider: effective.tts?.provider || (expected.tts.provider === "dograh_default" ? "dograh_default" : ""),
    effectiveTtsModel: effective.tts?.model || (expected.tts.provider === "dograh_default" ? "dograh_default" : ""),
    maskedVoiceId: maskVoiceId(effective.tts?.voiceId || expected.tts.voiceId),
    effectiveSttProvider: effective.stt?.provider || (expected.stt.provider === "dograh_default" ? "dograh_default" : ""),
    effectiveSttModel: effective.stt?.model || (expected.stt.provider === "dograh_default" ? "dograh_default" : ""),
    startCallPromptExists: startPromptOk,
    verificationResult: errors.length === 0
  });

  return {
    ok: errors.length === 0,
    errors,
    diagnostics,
    effective,
    expected,
    workflowPayload: payload
  };
}

export function assertRuntimeVerification(verification) {
  console.log("[Dograh Runtime Verification]", verification.diagnostics);
  if (verification.ok) return verification;
  throw new ApiError(400, verification.errors.join(" "), {
    code: "AGENT_RUNTIME_NOT_READY",
    diagnostics: verification.diagnostics,
    errors: verification.errors
  });
}
