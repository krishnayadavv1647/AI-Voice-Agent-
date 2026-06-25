import User from "../../models/User.js";
import { getActionPricing } from "../../config/creditPricing.js";
import { ApiError } from "../../utils/apiError.js";
import ledger from "./creditLedger.service.js";
import { creditEnforcementEnabled, evaluateFeatureAccess } from "./featureAccess.service.js";

// Charge credits for a single instantaneous feature action (email send, lead search, etc.).
// Verifies plan access + balance, charges once (idempotency-keyed), and records usage. Throws
// ApiError when blocked so request-driven callers fail closed. No-op unless CREDIT_ENFORCEMENT.
export async function chargeFeatureOrThrow({ userId, user, featureKey, idempotencyKey, metadata = {} }) {
  if (!creditEnforcementEnabled()) return { enforced: false, charged: 0 };

  const account = user || (await User.findById(userId).select("plan planStatus role"));
  const access = evaluateFeatureAccess(account, featureKey);
  if (!access.allowed) {
    throw new ApiError(access.reason === "NO_ACTIVE_PLAN" ? 402 : 403, access.message, { code: access.reason });
  }

  const { cost } = getActionPricing(featureKey);
  const charge = await ledger.charge({
    userId: account?._id || userId, amount: cost, action: featureKey,
    mode: "platform_credits", idempotencyKey, metadata
  });
  if (!charge.ok) {
    throw new ApiError(402, "You don't have enough credits for this. Top up or upgrade your plan.", { code: "INSUFFICIENT_CREDITS" });
  }

  await ledger.recordUsage({
    userId: account?._id || userId, action: featureKey, mode: "platform_credits",
    success: true, cost, creditsCharged: charge.amount || cost, metadata
  });
  return { enforced: true, charged: charge.amount || cost };
}

// Non-throwing variant for background workers (campaign sends, scheduled jobs). Returns a verdict
// so the worker can skip/halt gracefully instead of crashing.
export async function chargeFeature({ userId, featureKey, idempotencyKey, metadata = {} }) {
  try {
    const result = await chargeFeatureOrThrow({ userId, featureKey, idempotencyKey, metadata });
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, blocked: true, reason: error?.details?.code || "BLOCKED", message: error?.message };
  }
}

export default { chargeFeatureOrThrow, chargeFeature };
