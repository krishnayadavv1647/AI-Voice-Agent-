import Agent from "../models/Agent.js";
import UserIntegration from "../models/UserIntegration.js";
import { testDograhConnection } from "../services/dograhClientResolver.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { decryptSecret, encryptSecret, maskSecret } from "../utils/crypto.js";

function defaultBaseUrl() {
  return process.env.DOGRAH_BASE_URL || "https://app.dograh.com/api/v1";
}

function cleanBaseUrl(value) {
  return String(value || defaultBaseUrl()).trim().replace(/\/$/, "");
}

function deploymentTypeFor(baseUrl) {
  return cleanBaseUrl(baseUrl).includes("app.dograh.com") ? "cloud" : "self_hosted";
}

function safeDograhError(error, fallback = "Dograh connection failed.") {
  const status = error?.response?.status || error?.statusCode;
  if (error?.details?.code === "DOGRAH_UNSAFE_BASE_URL") return "Unsafe Dograh base URL.";
  if (status === 401 || status === 403) return "Dograh rejected the configured API key.";
  if (status === 404) return "Dograh endpoint was not found at the configured base URL.";
  if (status === 429) return "Dograh rate limit reached. Please try again later.";
  return error?.safeMessage || error?.message || fallback;
}

function keyLastFour(apiKey) {
  return String(apiKey || "").trim().slice(-4);
}

async function agentsUsingIntegration(userId, integrationId = null, type = "user_integration") {
  const filter = {
    userId,
    provider: "dograh",
    archivedAt: { $exists: false },
    dograhConnectionType: type
  };
  if (type === "user_integration") filter.dograhIntegrationId = integrationId;
  else filter.dograhIntegrationId = null;
  return Agent.find(filter).select("_id agentName name dograhWorkflowId dograhWorkflowUuid workflowSyncStatus");
}

async function platformSummary(userId) {
  const agents = await agentsUsingIntegration(userId, null, "platform");
  return {
    id: "platform",
    connectionName: "Platform Dograh",
    deploymentType: "cloud",
    connected: Boolean(process.env.DOGRAH_API_KEY),
    status: process.env.DOGRAH_API_KEY ? "available" : "unavailable",
    runtimeStatus: process.env.DOGRAH_API_KEY ? "available" : "configuration_required",
    baseUrl: defaultBaseUrl(),
    maskedApiKey: process.env.DOGRAH_API_KEY ? "platform managed" : "",
    platformManaged: true,
    allowPlatformFallback: false,
    lastValidatedAt: null,
    lastErrorSafeMessage: process.env.DOGRAH_API_KEY ? "" : "Platform Dograh is not configured.",
    agentsUsingConnection: agents.map((agent) => ({
      id: agent._id,
      name: agent.agentName || agent.name,
      workflowId: agent.dograhWorkflowId,
      workflowUuid: agent.dograhWorkflowUuid,
      syncStatus: agent.workflowSyncStatus
    }))
  };
}

function sanitizeIntegration(integration, agents = []) {
  if (!integration) {
    return {
      id: null,
      connectionName: "My Dograh",
      deploymentType: "cloud",
      connected: false,
      status: "disconnected",
      runtimeStatus: "configuration_required",
      baseUrl: defaultBaseUrl(),
      maskedApiKey: "",
      keyLastFour: "",
      accountEmail: "",
      workspaceId: "",
      apiVersion: "",
      allowPlatformFallback: false,
      lastTestedAt: null,
      lastValidatedAt: null,
      lastError: "",
      lastErrorSafeMessage: "",
      agentsUsingConnection: []
    };
  }

  let maskedApiKey = "";
  if (integration.apiKeyEncrypted) {
    try {
      maskedApiKey = maskSecret(decryptSecret(integration.apiKeyEncrypted));
    } catch {
      maskedApiKey = integration.keyLastFour ? `••••${integration.keyLastFour}` : "encrypted";
    }
  }

  return {
    id: integration._id,
    connectionName: integration.connectionName || "My Dograh",
    deploymentType: integration.deploymentType || deploymentTypeFor(integration.baseUrl),
    connected: integration.status === "connected",
    status: integration.status,
    runtimeStatus: integration.runtimeStatus || "unknown",
    baseUrl: integration.baseUrl || defaultBaseUrl(),
    maskedApiKey,
    keyLastFour: integration.keyLastFour || "",
    accountEmail: integration.accountEmail || "",
    workspaceId: integration.workspaceId || "",
    apiVersion: integration.apiVersion || "",
    allowPlatformFallback: Boolean(integration.allowPlatformFallback),
    lastTestedAt: integration.lastTestedAt || null,
    lastValidatedAt: integration.lastValidatedAt || null,
    lastError: integration.lastErrorSafeMessage || integration.lastError || "",
    lastErrorSafeMessage: integration.lastErrorSafeMessage || integration.lastError || "",
    agentsUsingConnection: agents.map((agent) => ({
      id: agent._id,
      name: agent.agentName || agent.name,
      workflowId: agent.dograhWorkflowId,
      workflowUuid: agent.dograhWorkflowUuid,
      syncStatus: agent.workflowSyncStatus
    }))
  };
}

async function getUserDograhIntegration(userId, integrationId) {
  if (integrationId) return UserIntegration.findOne({ _id: integrationId, userId, provider: "dograh" });
  return UserIntegration.findOne({ userId, provider: "dograh" });
}

async function upsertDograhIntegration({ userId, apiKey, baseUrl, testResult, status = "connected", lastError = "", allowPlatformFallback }) {
  const cleanUrl = cleanBaseUrl(baseUrl);
  const update = {
    provider: "dograh",
    connectionName: "My Dograh",
    deploymentType: deploymentTypeFor(cleanUrl),
    status,
    runtimeStatus: status === "connected" ? "available" : "unavailable",
    baseUrl: cleanUrl,
    lastTestedAt: new Date(),
    lastValidatedAt: status === "connected" ? new Date() : null,
    lastError,
    lastErrorSafeMessage: lastError,
    accountEmail: testResult?.accountEmail || "",
    workspaceId: testResult?.workspaceId || "",
    apiVersion: testResult?.apiVersion || "",
    metadata: {
      mode: testResult?.mode,
      capabilities: testResult?.capabilities,
      connectedAt: new Date()
    }
  };

  // A successful (re)connection clears any auto-deactivation / failure streak from a prior
  // broken key, so BYOK resumes immediately.
  if (status === "connected") {
    update.isActive = true;
    update.consecutiveFailures = 0;
    update.lastFailureReason = null;
    update.lastFailureAt = null;
  }

  if (allowPlatformFallback !== undefined) update.allowPlatformFallback = Boolean(allowPlatformFallback);
  if (apiKey) {
    update.apiKeyEncrypted = encryptSecret(apiKey);
    update.keyLastFour = keyLastFour(apiKey);
  }

  const setOnInsert = { userId };
  if (allowPlatformFallback === undefined) setOnInsert.allowPlatformFallback = false;

  return UserIntegration.findOneAndUpdate(
    { userId, provider: "dograh" },
    { $set: update, $setOnInsert: setOnInsert },
    { new: true, upsert: true, runValidators: true }
  );
}

export const getDograhIntegration = asyncHandler(async (req, res) => {
  const integration = await getUserDograhIntegration(req.user._id);
  const agents = integration ? await agentsUsingIntegration(req.user._id, integration._id) : [];
  const platform = await platformSummary(req.user._id);
  const userDograh = sanitizeIntegration(integration, agents);
  res.json({
    platform,
    userDograh,
    connections: [platform, userDograh],
    connected: userDograh.connected,
    status: userDograh.status,
    baseUrl: userDograh.baseUrl,
    maskedApiKey: userDograh.maskedApiKey,
    accountEmail: userDograh.accountEmail,
    workspaceId: userDograh.workspaceId,
    lastTestedAt: userDograh.lastTestedAt,
    lastError: userDograh.lastError
  });
});

export const connectDograhIntegration = asyncHandler(async (req, res) => {
  const apiKey = String(req.body.apiKey || "").trim();
  const baseUrl = cleanBaseUrl(req.body.baseUrl);
  if (!apiKey) throw new ApiError(400, "Dograh API key is required.");

  try {
    const testResult = await testDograhConnection({ apiKey, baseUrl });
    const integration = await upsertDograhIntegration({
      userId: req.user._id,
      apiKey,
      baseUrl,
      testResult,
      allowPlatformFallback: req.body.allowPlatformFallback
    });
    const agents = await agentsUsingIntegration(req.user._id, integration._id);
    res.status(201).json(sanitizeIntegration(integration, agents));
  } catch (error) {
    const safeMessage = safeDograhError(error);
    await upsertDograhIntegration({
      userId: req.user._id,
      apiKey,
      baseUrl,
      testResult: null,
      status: error?.details?.code === "DOGRAH_UNSAFE_BASE_URL" ? "invalid" : "failed",
      lastError: safeMessage,
      allowPlatformFallback: req.body.allowPlatformFallback
    });
    throw new ApiError(error.statusCode || error.response?.status || 502, safeMessage, {
      code: error?.details?.code || "DOGRAH_INTEGRATION_INVALID"
    });
  }
});

export const testDograhIntegration = asyncHandler(async (req, res) => {
  const providedApiKey = String(req.body.apiKey || "").trim();
  const integration = await getUserDograhIntegration(req.user._id, req.params.integrationId);
  const baseUrl = cleanBaseUrl(req.body.baseUrl || integration?.baseUrl);

  if (!providedApiKey && !integration?.apiKeyEncrypted) {
    throw new ApiError(400, "Add a Dograh API key before testing.");
  }

  try {
    const apiKey = providedApiKey || decryptSecret(integration.apiKeyEncrypted);
    const testResult = await testDograhConnection({ apiKey, baseUrl });
    if (integration) {
      integration.status = "connected";
      integration.runtimeStatus = "available";
      integration.baseUrl = baseUrl;
      integration.deploymentType = deploymentTypeFor(baseUrl);
      integration.lastTestedAt = new Date();
      integration.lastValidatedAt = new Date();
      integration.lastError = "";
      integration.lastErrorSafeMessage = "";
      // Passing a live test reactivates a previously auto-deactivated key.
      integration.isActive = true;
      integration.consecutiveFailures = 0;
      integration.lastFailureReason = null;
      integration.lastFailureAt = null;
      integration.accountEmail = testResult.accountEmail || integration.accountEmail;
      integration.workspaceId = testResult.workspaceId || integration.workspaceId;
      integration.apiVersion = testResult.apiVersion || integration.apiVersion;
      integration.metadata = { ...(integration.metadata || {}), capabilities: testResult.capabilities };
      await integration.save();
    }
    const agents = integration ? await agentsUsingIntegration(req.user._id, integration._id) : [];
    res.json({ ...sanitizeIntegration(integration, agents), success: true, test: testResult.capabilities });
  } catch (error) {
    const safeMessage = safeDograhError(error);
    if (integration) {
      integration.status = error?.details?.code === "DOGRAH_UNSAFE_BASE_URL" ? "invalid" : "failed";
      integration.runtimeStatus = "unavailable";
      integration.lastTestedAt = new Date();
      integration.lastError = safeMessage;
      integration.lastErrorSafeMessage = safeMessage;
      await integration.save();
    }
    throw new ApiError(error.statusCode || error.response?.status || 502, safeMessage, {
      code: error?.details?.code || "DOGRAH_INTEGRATION_INVALID"
    });
  }
});

export const updateDograhIntegration = asyncHandler(async (req, res) => {
  const integration = await getUserDograhIntegration(req.user._id, req.params.integrationId);
  if (!integration) throw new ApiError(404, "Dograh integration not found. Connect Dograh first.");

  const apiKey = String(req.body.apiKey || "").trim();
  const baseUrl = cleanBaseUrl(req.body.baseUrl || integration.baseUrl);
  const keyForTest = apiKey || decryptSecret(integration.apiKeyEncrypted);

  const testResult = await testDograhConnection({ apiKey: keyForTest, baseUrl });
  const updated = await upsertDograhIntegration({
    userId: req.user._id,
    apiKey,
    baseUrl,
    testResult,
    allowPlatformFallback: req.body.allowPlatformFallback
  });
  const agents = await agentsUsingIntegration(req.user._id, updated._id);
  res.json(sanitizeIntegration(updated, agents));
});

export const updateDograhFallback = asyncHandler(async (req, res) => {
  const integration = await getUserDograhIntegration(req.user._id, req.params.integrationId);
  if (!integration) throw new ApiError(404, "Dograh integration not found. Connect Dograh first.");
  integration.allowPlatformFallback = Boolean(req.body.allowPlatformFallback);
  await integration.save();
  const agents = await agentsUsingIntegration(req.user._id, integration._id);
  res.json(sanitizeIntegration(integration, agents));
});

export const disconnectDograhIntegration = asyncHandler(async (req, res) => {
  const integration = await getUserDograhIntegration(req.user._id, req.params.integrationId);
  if (!integration) return res.json({ success: true, ...sanitizeIntegration(null) });

  const agents = await agentsUsingIntegration(req.user._id, integration._id);
  if (agents.length) {
    throw new ApiError(409, "This Dograh connection is used by active agents.", {
      code: "DOGRAH_INTEGRATION_IN_USE",
      affectedAgents: agents.map((agent) => ({ id: agent._id, name: agent.agentName || agent.name }))
    });
  }

  integration.status = "disconnected";
  integration.runtimeStatus = "configuration_required";
  integration.lastError = "";
  integration.lastErrorSafeMessage = "";
  await integration.save();
  res.json({ success: true, ...sanitizeIntegration(integration, []) });
});
