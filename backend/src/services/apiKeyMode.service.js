// Single source of truth for "which API key mode is active" and its derived behaviour.
// PURELY additive — it does not modify any existing resolver; it only tells callers what to do.
//
// See the "Default System vs BYOK" spec: the enforcement point for "no silent fallback" is
// assertByokKeyUsableOrThrow, which runs BEFORE any credit reservation in the outbound call flow.
import LLMIntegration from "../models/LLMIntegration.js";
import AgentLLMConfiguration from "../models/AgentLLMConfiguration.js";
import { decryptSecret } from "../utils/crypto.js";
import { normalizeLLMProvider } from "./llmProviders/providerIdentity.service.js";
import { ApiError } from "../utils/apiError.js";

export const API_KEY_MODES = Object.freeze(["default_system", "byok"]);

export function normalizeApiKeyMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return API_KEY_MODES.includes(mode) ? mode : "default_system"; // fail-closed default
}

export function isDefaultSystem(agent) {
  return normalizeApiKeyMode(agent?.apiKeyMode) === "default_system";
}

export function isByok(agent) {
  return normalizeApiKeyMode(agent?.apiKeyMode) === "byok";
}

// STRICT BYOK PRE-FLIGHT VALIDATION.
// Throws an ApiError (no credits touched) if the agent is in BYOK mode but its own LLM key
// cannot be resolved and decrypted. Returns silently for default_system (which uses platform keys).
// This is the enforcement point for "no silent fallback": we DO NOT fall back to the env key here.
export async function assertByokKeyUsableOrThrow(agent) {
  if (!isByok(agent)) return; // default_system -> platform key path, nothing to validate here.

  const savedConfig = await AgentLLMConfiguration.findOne({
    agentId: agent._id,
    userId: agent.userId
  });

  const provider = normalizeLLMProvider(savedConfig?.provider || agent?.llmProvider);

  if (!savedConfig || provider === "platform_default" || !savedConfig.integrationId) {
    throw new ApiError(
      400,
      "This agent is set to use your own API keys (BYOK), but no connected LLM account is selected. Connect an LLM account or switch the agent to Default System.",
      { code: "BYOK_NOT_CONFIGURED" }
    );
  }

  const integration = await LLMIntegration.findOne({
    _id: savedConfig.integrationId,
    userId: agent.userId,
    provider,
    credentialStatus: "connected"
  }).select("+encryptedCredentials");

  if (!integration || !integration.encryptedCredentials) {
    throw new ApiError(
      400,
      "Your connected LLM account for this agent is missing or was disconnected. Reconnect it or switch to Default System. The call was not started and no credits were used.",
      { code: "BYOK_KEY_MISSING" }
    );
  }

  let apiKey = "";
  try {
    const credentials = JSON.parse(decryptSecret(integration.encryptedCredentials));
    apiKey = String(credentials?.apiKey || "").trim();
  } catch {
    apiKey = "";
  }

  if (!apiKey) {
    throw new ApiError(
      400,
      "Your BYOK LLM key could not be read (it may be invalid or corrupted). Update the key or switch to Default System. The call was not started and no credits were used.",
      { code: "BYOK_KEY_INVALID" }
    );
  }

  return { provider, integrationId: integration._id }; // usable
}
