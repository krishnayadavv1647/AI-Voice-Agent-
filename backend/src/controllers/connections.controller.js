import UserIntegration from "../models/UserIntegration.js";
import ledger from "../services/billing/creditLedger.service.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { decryptSecret, maskSecret } from "../utils/crypto.js";

function sanitizeDograhConnection(integration, walletBalance) {
  if (!integration) {
    return {
      connected: false,
      status: "disconnected",
      hasValidatedKey: false,
      preferOwnKey: false,
      fallbackOnFailure: false,
      consecutiveFailures: 0,
      isActive: true,
      lastFailureReason: null,
      lastFailureAt: null,
      maskedApiKey: "",
      walletBalance
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
    connected: integration.status === "connected",
    status: integration.status,
    hasValidatedKey: integration.status === "connected" && Boolean(integration.apiKeyEncrypted),
    preferOwnKey: Boolean(integration.preferOwnKey),
    fallbackOnFailure: Boolean(integration.fallbackOnFailure),
    consecutiveFailures: integration.consecutiveFailures || 0,
    isActive: integration.isActive !== false,
    lastFailureReason: integration.lastFailureReason || null,
    lastFailureAt: integration.lastFailureAt || null,
    maskedApiKey,
    walletBalance
  };
}

// GET /api/connections/dograh
export const getDograhConnection = asyncHandler(async (req, res) => {
  const [integration, walletBalance] = await Promise.all([
    UserIntegration.findOne({ userId: req.user._id, provider: "dograh" }),
    ledger.getBalance(req.user._id)
  ]);
  res.json(sanitizeDograhConnection(integration, walletBalance));
});

// PATCH /api/connections/dograh/preferences  { preferOwnKey, fallbackOnFailure }
export const updateDograhPreferences = asyncHandler(async (req, res) => {
  const integration = await UserIntegration.findOne({ userId: req.user._id, provider: "dograh" });
  if (!integration || integration.status !== "connected" || !integration.apiKeyEncrypted) {
    throw new ApiError(400, "Connect and validate a Dograh API key before setting key preferences.", {
      code: "DOGRAH_KEY_NOT_VALIDATED"
    });
  }

  if (req.body.preferOwnKey !== undefined) {
    integration.preferOwnKey = Boolean(req.body.preferOwnKey);
  }
  if (req.body.fallbackOnFailure !== undefined) {
    integration.fallbackOnFailure = Boolean(req.body.fallbackOnFailure);
  }
  await integration.save();

  const walletBalance = await ledger.getBalance(req.user._id);
  res.json(sanitizeDograhConnection(integration, walletBalance));
});

export default { getDograhConnection, updateDograhPreferences };
