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

function sanitizeIntegration(integration) {
  if (!integration) {
    return {
      connected: false,
      status: "disconnected",
      baseUrl: defaultBaseUrl(),
      maskedApiKey: "",
      accountEmail: "",
      workspaceId: "",
      lastTestedAt: null,
      lastError: ""
    };
  }

  let maskedApiKey = "";
  if (integration.apiKeyEncrypted) {
    try {
      maskedApiKey = maskSecret(decryptSecret(integration.apiKeyEncrypted));
    } catch {
      maskedApiKey = "encrypted";
    }
  }

  return {
    connected: integration.status === "connected",
    status: integration.status,
    baseUrl: integration.baseUrl || defaultBaseUrl(),
    maskedApiKey,
    accountEmail: integration.accountEmail || "",
    workspaceId: integration.workspaceId || "",
    lastTestedAt: integration.lastTestedAt || null,
    lastError: integration.lastError || ""
  };
}

async function getUserDograhIntegration(userId) {
  return UserIntegration.findOne({ userId, provider: "dograh" });
}

async function upsertDograhIntegration({ userId, apiKey, baseUrl, testResult, status = "connected", lastError = "" }) {
  const update = {
    provider: "dograh",
    status,
    baseUrl: cleanBaseUrl(baseUrl),
    lastTestedAt: new Date(),
    lastError,
    accountEmail: testResult?.accountEmail || "",
    workspaceId: testResult?.workspaceId || "",
    metadata: {
      mode: testResult?.mode,
      connectedAt: new Date()
    }
  };

  if (apiKey) update.apiKeyEncrypted = encryptSecret(apiKey);

  return UserIntegration.findOneAndUpdate(
    { userId, provider: "dograh" },
    { $set: update, $setOnInsert: { userId } },
    { new: true, upsert: true, runValidators: true }
  );
}

export const getDograhIntegration = asyncHandler(async (req, res) => {
  res.json(sanitizeIntegration(await getUserDograhIntegration(req.user._id)));
});

export const connectDograhIntegration = asyncHandler(async (req, res) => {
  const apiKey = String(req.body.apiKey || "").trim();
  const baseUrl = cleanBaseUrl(req.body.baseUrl);
  if (!apiKey) throw new ApiError(400, "Dograh API key is required.");

  try {
    const testResult = await testDograhConnection({ apiKey, baseUrl });
    const integration = await upsertDograhIntegration({ userId: req.user._id, apiKey, baseUrl, testResult });
    res.status(201).json(sanitizeIntegration(integration));
  } catch (error) {
    await upsertDograhIntegration({
      userId: req.user._id,
      apiKey,
      baseUrl,
      testResult: null,
      status: "failed",
      lastError: error.response?.data?.message || error.response?.data?.error || error.message
    });
    throw new ApiError(error.statusCode || error.response?.status || 502, "Your Dograh API connection failed. Please update your Dograh API key in Settings.", {
      dograhError: error.response?.data || error.message
    });
  }
});

export const testDograhIntegration = asyncHandler(async (req, res) => {
  const providedApiKey = String(req.body.apiKey || "").trim();
  const baseUrl = cleanBaseUrl(req.body.baseUrl);
  const integration = await getUserDograhIntegration(req.user._id);

  if (!providedApiKey && !integration?.apiKeyEncrypted) {
    throw new ApiError(400, "Add a Dograh API key before testing.");
  }

  try {
    const apiKey = providedApiKey || decryptSecret(integration.apiKeyEncrypted);
    const testResult = await testDograhConnection({ apiKey, baseUrl });
    if (integration) {
      integration.status = "connected";
      integration.baseUrl = baseUrl;
      integration.lastTestedAt = new Date();
      integration.lastError = "";
      integration.accountEmail = testResult.accountEmail || integration.accountEmail;
      integration.workspaceId = testResult.workspaceId || integration.workspaceId;
      await integration.save();
    }
    res.json({ ...sanitizeIntegration(integration), success: true, test: { success: true, mode: testResult.mode } });
  } catch (error) {
    if (integration) {
      integration.status = "failed";
      integration.lastTestedAt = new Date();
      integration.lastError = error.response?.data?.message || error.response?.data?.error || error.message;
      await integration.save();
    }
    throw new ApiError(error.statusCode || error.response?.status || 502, "Dograh connection test failed.", {
      dograhError: error.response?.data || error.message
    });
  }
});

export const updateDograhIntegration = asyncHandler(async (req, res) => {
  const integration = await getUserDograhIntegration(req.user._id);
  if (!integration) throw new ApiError(404, "Dograh integration not found. Connect Dograh first.");

  const apiKey = String(req.body.apiKey || "").trim();
  const baseUrl = cleanBaseUrl(req.body.baseUrl || integration.baseUrl);
  const keyForTest = apiKey || decryptSecret(integration.apiKeyEncrypted);

  const testResult = await testDograhConnection({ apiKey: keyForTest, baseUrl });
  const updated = await upsertDograhIntegration({ userId: req.user._id, apiKey, baseUrl, testResult });
  res.json(sanitizeIntegration(updated));
});

export const disconnectDograhIntegration = asyncHandler(async (req, res) => {
  const integration = await getUserDograhIntegration(req.user._id);
  if (integration) {
    integration.status = "disconnected";
    integration.lastError = "";
    await integration.save();
  }
  res.json({ success: true, ...sanitizeIntegration(integration) });
});
