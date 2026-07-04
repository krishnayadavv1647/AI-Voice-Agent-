import UserIntegration from "../models/UserIntegration.js";
import ledger from "../services/billing/creditLedger.service.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { decryptSecret, maskSecret } from "../utils/crypto.js";

// The provider a user may bring their own key for on voice calls. There is no BYOK voice provider
// after the platform moved fully to Vapi, so this normally resolves to "not connected"; the shape
// is kept so the billing resolver and the Connections UI keep working if BYOK is reintroduced.
const VOICE_BYOK_PROVIDER = "vapi";

function sanitizeVoiceConnection(integration, walletBalance) {
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

// GET /api/connections/voice
export const getVoiceConnection = asyncHandler(async (req, res) => {
  const [integration, walletBalance] = await Promise.all([
    UserIntegration.findOne({ userId: req.user._id, provider: VOICE_BYOK_PROVIDER }),
    ledger.getBalance(req.user._id)
  ]);
  res.json(sanitizeVoiceConnection(integration, walletBalance));
});

// PATCH /api/connections/voice/preferences  { preferOwnKey, fallbackOnFailure }
export const updateVoicePreferences = asyncHandler(async (req, res) => {
  const integration = await UserIntegration.findOne({ userId: req.user._id, provider: VOICE_BYOK_PROVIDER });
  if (!integration || integration.status !== "connected" || !integration.apiKeyEncrypted) {
    throw new ApiError(400, "Connect and validate a voice API key before setting key preferences.", {
      code: "VOICE_KEY_NOT_VALIDATED"
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
  res.json(sanitizeVoiceConnection(integration, walletBalance));
});

export default { getVoiceConnection, updateVoicePreferences };
