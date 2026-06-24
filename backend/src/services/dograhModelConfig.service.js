// Shared resolver for Dograh "Model Configuration V2" workflow schemas.
//
// Dograh returns workflow_configurations that may carry BYOK provider settings in
// one of two shapes:
//   - legacy:  workflow_configurations.model_overrides.{llm,tts,stt}
//   - V2:      workflow_configurations.model_configuration_v2_override.<...nested...>
//
// The V2 shape is not stable across Dograh versions: the TTS/STT/LLM blocks can live
// under different keys (tts / voice / speech / audio / models.tts / input.stt /
// output.tts ...) or inside workflow nodes/steps that carry a `type` field. This module
// detects those blocks robustly so callers can perform a *safe selective* update without
// overwriting the whole workflow.

export function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function compact(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")
  );
}

// Returns the key structure of a config object (keys only, no values) so the real Dograh
// schema can be inspected in logs without leaking API keys or other secrets.
export function describeShape(value, depth = 0) {
  if (Array.isArray(value)) {
    return depth > 4 ? "[...]" : value.slice(0, 6).map((item) => describeShape(item, depth + 1));
  }
  if (!value || typeof value !== "object" || depth > 4) return typeof value;
  return Object.fromEntries(Object.keys(value).map((key) => [key, describeShape(value[key], depth + 1)]));
}

export function detectModelConfigVersion(configurations) {
  const config = asObject(configurations);
  if (config.model_configuration_v2_override || config.modelConfigurationV2Override) return "v2";
  if (config.model_overrides || config.modelOverrides) return "legacy";
  return "none";
}

// Top-level keys available in the workflow configurations + the V2 override, used in
// diagnostics so a missing-config error tells the operator exactly what Dograh returned.
export function availableModelConfigKeys(configurations) {
  const config = asObject(configurations);
  const v2 = asObject(config.model_configuration_v2_override || config.modelConfigurationV2Override);
  return {
    workflowConfigurationKeys: Object.keys(config),
    modelConfigurationV2Keys: Object.keys(v2)
  };
}

const TYPE_SPECS = {
  tts: {
    names: ["tts", "text_to_speech", "texttospeech", "speech_synthesis", "speechsynthesis", "synthesizer", "voice", "speech", "audio", "output_audio", "outputaudio"],
    partials: ["tts", "voice", "speech", "synth", "audio"],
    typeValues: ["tts", "text_to_speech", "texttospeech", "voice", "speech", "audio", "synthesis", "synthesizer"]
  },
  stt: {
    names: ["stt", "speech_to_text", "speechtotext", "transcription", "transcriber", "transcript", "asr", "input_audio", "inputaudio"],
    partials: ["stt", "transcri", "asr"],
    typeValues: ["stt", "speech_to_text", "speechtotext", "transcription", "transcriber", "asr"]
  },
  llm: {
    names: ["llm", "language_model", "languagemodel", "chat_model", "chatmodel"],
    partials: ["llm", "language", "chat"],
    typeValues: ["llm", "language_model", "languagemodel", "chat", "chat_model"]
  }
};

function typeHint(object) {
  return String(
    object.type ||
      object.node_type ||
      object.nodeType ||
      object.kind ||
      object.role ||
      object.category ||
      object.service ||
      ""
  ).toLowerCase();
}

function hasModelFields(object) {
  return (
    "provider" in object ||
    "model" in object ||
    "model_id" in object ||
    "modelId" in object ||
    "model_name" in object ||
    "modelName" in object
  );
}

function hasVoiceFields(object) {
  return "voice" in object || "voice_id" in object || "voiceId" in object || "ttsVoiceId" in object;
}

function scoreNode(accessKey, object, type) {
  const spec = TYPE_SPECS[type];
  const key = String(accessKey ?? "").toLowerCase();
  const hint = typeHint(object);
  let score = 0;

  if (spec.names.includes(key)) score += 4;
  else if (spec.partials.some((part) => key.includes(part))) score += 2;

  if (spec.typeValues.includes(hint)) score += 4;
  else if (hint && spec.partials.some((part) => hint.includes(part))) score += 2;

  if (hasModelFields(object)) score += 2;
  if (type === "tts" && hasVoiceFields(object)) score += 2;

  return score;
}

// Walks the V2 override (objects AND arrays, so workflow nodes/steps are covered) and
// returns the access path to the best-matching TTS/STT/LLM block, or null.
export function findModelConfigPath(root, type) {
  if (!TYPE_SPECS[type]) throw new Error(`Unknown model config type: ${type}`);
  const seen = new Set();
  let best = null;

  function visit(value, path) {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);

    const entries = Array.isArray(value)
      ? value.map((item, index) => [index, item])
      : Object.entries(value);

    for (const [key, child] of entries) {
      if (!child || typeof child !== "object") continue;
      if (!Array.isArray(child)) {
        const score = scoreNode(key, child, type);
        if (score >= 6 && (!best || score > best.score)) best = { path: [...path, key], score };
      }
      visit(child, [...path, key]);
    }
  }

  visit(root, []);
  return best?.path || null;
}

// Array-safe path accessors (the legacy helpers coerced arrays to {} and broke node paths).
export function getAtPath(root, path) {
  return path.reduce((current, key) => (current == null ? undefined : current[key]), root);
}

export function setAtPath(root, path, value) {
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (current[key] == null || typeof current[key] !== "object") current[key] = {};
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}

// Builds the clear, structured error required when no TTS/STT block can be detected
// and none can be created (carries workflow id, agent id, version, available keys, reason).
export function buildMissingModelConfigError({ type, agentId, workflowId, configurations, reason }) {
  const version = detectModelConfigVersion(configurations);
  const keys = availableModelConfigKeys(configurations);
  const label = type.toUpperCase();
  const error = new Error(
    `${label} configuration could not be initialized for this Dograh workflow. ${reason || "No recognizable configuration object was found."}`
  );
  error.safeMessage = `Could not initialize ${label} settings on the Dograh workflow. ${reason || ""}`.trim();
  error.configurationRequired = true;
  error.details = {
    type,
    agentId: agentId ? String(agentId) : "",
    workflowId: workflowId ? String(workflowId) : "",
    detectedConfigurationVersion: version,
    availableModelConfigurationKeys: keys.modelConfigurationV2Keys,
    availableWorkflowConfigurationKeys: keys.workflowConfigurationKeys,
    missingReason: reason || "No recognizable configuration object was found."
  };
  return error;
}
