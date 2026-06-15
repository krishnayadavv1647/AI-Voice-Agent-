import Agent from "../models/Agent.js";
import AgentLLMConfiguration from "../models/AgentLLMConfiguration.js";
import LLMIntegration from "../models/LLMIntegration.js";
import { decryptSecret } from "../utils/crypto.js";
import { getDograhClientForUser } from "./dograhClientResolver.js";
import { extractWorkflowDefinition } from "./dograhWorkflowConfig.service.js";
import { getLLMProvider } from "./llmProviders/LLMProviderFactory.js";
import { validateLLMModel } from "./llmProviders/llmModelValidation.service.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function sameValue(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function safeMessage(error) {
  const status = error?.response?.status || error?.statusCode;
  if (status === 401 || status === 403) return "Dograh rejected the configured credentials.";
  if (status === 404) return "The existing Dograh workflow was not found.";
  if (status === 409) return "Dograh rejected the LLM configuration because it conflicts with the current workflow state.";
  if (status === 422) return "Dograh rejected one or more provider or model values.";
  if (status === 429) return "Dograh rate limit reached while syncing LLM configuration.";
  return error?.safeMessage || "Dograh LLM configuration synchronization failed.";
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

function readLLMEffectiveFromObject(value) {
  const object = asObject(value);
  return {
    provider: object.provider || object.llmProvider || object.service || "",
    model: object.model || object.model_id || object.modelId || object.llmModel || ""
  };
}

function llmPathScore(key, value) {
  const lower = String(key || "").toLowerCase();
  const object = asObject(value);
  let score = 0;
  if (["llm", "language_model", "languagemodel", "model", "chat_model", "chatmodel"].includes(lower)) score += 4;
  if (lower.includes("llm") || lower.includes("language") || lower.includes("chat")) score += 2;
  if ("provider" in object || "model" in object || "model_id" in object || "modelId" in object) score += 3;
  if ("api_key" in object || "base_url" in object) score += 1;
  return score;
}

function findV2LLMPath(root) {
  const seen = new Set();
  let best = null;

  function visit(value, path) {
    if (!value || typeof value !== "object" || Array.isArray(value) || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (!child || typeof child !== "object" || Array.isArray(child)) continue;
      const score = llmPathScore(key, child);
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

function extractEffectiveLLM(configurations) {
  const legacy = readLLMEffectiveFromObject(configurations?.model_overrides?.llm);
  if (legacy.provider || legacy.model) return legacy;

  const v2 = asObject(configurations?.model_configuration_v2_override);
  const path = findV2LLMPath(v2);
  if (!path) return null;
  return readLLMEffectiveFromObject(getAtPath(v2, path));
}

function mergeLLMConfigurations(existingConfigurations, override, config) {
  if (existingConfigurations.model_configuration_v2_override) {
    const nextConfigurations = { ...existingConfigurations };
    const v2 = { ...asObject(existingConfigurations.model_configuration_v2_override) };
    const path = findV2LLMPath(v2);

    if (!path && config.provider !== "dograh_default") {
      const error = new Error("This Dograh workflow uses Model Configuration V2, but no recognizable LLM configuration object was found for a safe selective update.");
      error.safeMessage = error.message;
      error.configurationRequired = true;
      throw error;
    }

    if (path) {
      if (config.provider === "dograh_default") {
        const existing = { ...asObject(getAtPath(v2, path)) };
        for (const key of ["provider", "api_key", "model", "model_id", "modelId", "base_url", "temperature", "max_tokens"]) delete existing[key];
        setAtPath(v2, path, existing);
      } else {
        setAtPath(v2, path, compact({ ...asObject(getAtPath(v2, path)), ...override }));
      }
    }

    nextConfigurations.model_configuration_v2_override = v2;
    return nextConfigurations;
  }

  const existingOverrides = { ...asObject(existingConfigurations.model_overrides) };
  if (config.provider === "dograh_default") delete existingOverrides.llm;
  else existingOverrides.llm = compact(override);

  const nextConfigurations = { ...existingConfigurations };
  if (Object.keys(existingOverrides).length) nextConfigurations.model_overrides = existingOverrides;
  else delete nextConfigurations.model_overrides;
  return nextConfigurations;
}

async function integrationCredential(config, userId) {
  if (config.provider === "dograh_default") return null;
  const integration = await LLMIntegration.findOne({ _id: config.integrationId, userId, provider: config.provider }).select("+encryptedCredentials");
  if (!integration?.encryptedCredentials || integration.credentialStatus !== "connected") return null;
  return {
    integration,
    credentials: JSON.parse(decryptSecret(integration.encryptedCredentials))
  };
}

function debugSync(event) {
  console.log("[Dograh LLM Sync]", compact(event));
}

export async function syncAgentLLMConfigurationToDograh({ agent, userId }) {
  const config = await AgentLLMConfiguration.findOne({ agentId: agent._id, userId });
  if (!config || agent.provider !== "dograh") return config;

  const workflowId = agent.dograhWorkflowId || agent.providerWorkflowId;
  if (!workflowId) {
    config.dograhSyncStatus = "pending";
    config.dograhSyncError = "Dograh workflow must exist before LLM settings can be synchronized.";
    await config.save();
    return config;
  }

  config.dograhSyncStatus = "syncing";
  config.dograhSyncError = "";
  config.dograhEffectiveProvider = "";
  config.dograhEffectiveModel = "";
  await config.save();

  try {
    const resolvedCredential = await integrationCredential(config, userId);
    let override = null;
    if (config.provider !== "dograh_default") {
      if (!resolvedCredential?.credentials?.apiKey) {
        const error = new Error(`A connected ${config.provider} credential is required for Dograh LLM sync.`);
        error.safeMessage = error.message;
        throw error;
      }
      const adapter = getLLMProvider(config.provider);
      await validateLLMModel({
        provider: config.provider,
        integrationId: config.integrationId,
        modelId: config.model,
        credentials: resolvedCredential.credentials,
        userId
      });
      override = await adapter.buildDograhOverride({
        credentials: resolvedCredential.credentials,
        integration: resolvedCredential.integration,
        agentConfiguration: config
      });
    }

    const resolved = await getDograhClientForUser(userId, { allowGlobalFallbackOnError: false });
    const current = await resolved.client.get(`/workflow/fetch/${encodeURIComponent(workflowId)}`);
    const workflowConfigurations = mergeLLMConfigurations(extractWorkflowConfigurations(current.data), override, config);

    debugSync({
      userId: String(userId),
      integrationId: config.integrationId ? String(config.integrationId) : "",
      provider: config.provider,
      localAgentId: String(agent._id),
      dograhWorkflowId: workflowId,
      model: config.model,
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
    const effective = extractEffectiveLLM(extractWorkflowConfigurations(verified.data)) || {};
    const verificationResult = config.provider === "dograh_default"
      ? !effective.provider && !effective.model
      : sameValue(effective.provider, config.provider) && sameValue(effective.model, config.model);

    debugSync({
      userId: String(userId),
      integrationId: config.integrationId ? String(config.integrationId) : "",
      provider: config.provider,
      localAgentId: String(agent._id),
      dograhWorkflowId: workflowId,
      model: config.model,
      syncStep: "read_back_verification",
      statusCode: update.status,
      verificationResult
    });

    if (!verificationResult) {
      const error = new Error("Dograh accepted the LLM update request, but read-back verification did not show the selected provider and model.");
      error.safeMessage = error.message;
      error.configurationRequired = true;
      throw error;
    }

    config.dograhSyncStatus = "synced";
    config.dograhLastSyncedAt = new Date();
    config.dograhSyncError = "";
    config.dograhEffectiveProvider = config.provider === "dograh_default" ? "dograh_default" : effective.provider;
    config.dograhEffectiveModel = config.provider === "dograh_default" ? "" : effective.model;
    await config.save();

    await Agent.updateOne(
      { _id: agent._id, userId },
      { $unset: { dograhEmbedToken: "" }, $set: { dograhWidgetEnabled: false } }
    );
    if (resolvedCredential?.integration) {
      resolvedCredential.integration.runtimeStatus = "supported";
      resolvedCredential.integration.lastErrorSafeMessage = "";
      await resolvedCredential.integration.save();
    }
    return config;
  } catch (error) {
    const message = safeMessage(error);
    config.dograhSyncStatus = error?.configurationRequired ? "configuration_required" : "failed";
    config.dograhSyncError = message;
    config.dograhEffectiveProvider = "";
    config.dograhEffectiveModel = "";
    await config.save();
    if (config.integrationId) {
      await LLMIntegration.updateOne(
        { _id: config.integrationId, userId },
        { $set: { runtimeStatus: error?.configurationRequired ? "configuration_required" : "sync_failed", lastErrorSafeMessage: message } }
      );
    }
    return config;
  }
}

export async function getDograhLLMRuntimeSummary({ agent, userId }) {
  const config = await AgentLLMConfiguration.findOne({ agentId: agent._id, userId });
  const requiresSync = Boolean(config && config.provider && config.provider !== "dograh_default");
  return {
    requiresSync,
    dograhSyncStatus: config?.dograhSyncStatus || (requiresSync ? "not_configured" : "synced"),
    dograhSyncError: config?.dograhSyncError || "",
    configuredProvider: config?.provider || "dograh_default",
    configuredModel: config?.model || "",
    effectiveProvider: config?.dograhEffectiveProvider || (requiresSync ? "" : "dograh_default"),
    effectiveModel: config?.dograhEffectiveModel || "",
    lastVerifiedAt: config?.dograhLastSyncedAt || null
  };
}
