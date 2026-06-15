import LLMIntegration from "../../models/LLMIntegration.js";
import { decryptSecret } from "../../utils/crypto.js";
import { getLLMProvider } from "./LLMProviderFactory.js";
import { invalidLLMModelError, normalizeModelId } from "./modelClassification.service.js";
import { normalizeLLMProvider } from "./providerIdentity.service.js";

export async function validateLLMModel({
  provider,
  integrationId,
  modelId,
  credentials,
  userId
}) {
  const canonicalProvider = normalizeLLMProvider(provider, { allowDefault: false });
  const canonicalModelId = normalizeModelId(modelId);
  if (!canonicalModelId) throw invalidLLMModelError();

  let resolvedCredentials = credentials;
  if (!resolvedCredentials && integrationId) {
    const query = { _id: integrationId, provider: canonicalProvider, credentialStatus: "connected" };
    if (userId) query.userId = userId;
    const integration = await LLMIntegration.findOne(query).select("+encryptedCredentials");
    if (integration?.encryptedCredentials) {
      resolvedCredentials = JSON.parse(decryptSecret(integration.encryptedCredentials));
    }
  }

  const adapter = getLLMProvider(canonicalProvider);
  const compatible = await adapter.isChatCompatibleModel(canonicalModelId, resolvedCredentials);
  if (!compatible) throw invalidLLMModelError();
  return canonicalModelId;
}
