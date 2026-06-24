import UserIntegration from "../../models/UserIntegration.js";
import { notifyDograhKeyDeactivated } from "../notification.service.js";
import ledger from "./creditLedger.service.js";
import { resolveProvider } from "./providerResolver.service.js";

const MAX_BYOK_FAILURES = 3;

function safeReason(error) {
  return String(error?.safeMessage || error?.message || "Unknown error").slice(0, 500);
}

// Increment the failure counter; after MAX_BYOK_FAILURES consecutive failures, auto-deactivate
// the connection and notify the user so a dead/revoked key is not retried on every later call.
export async function recordByokFailure(integration, reason, deps = {}) {
  const notify = deps.notify || notifyDograhKeyDeactivated;
  integration.consecutiveFailures = (integration.consecutiveFailures || 0) + 1;
  integration.lastFailureAt = new Date();
  integration.lastFailureReason = reason;

  let deactivated = false;
  if (integration.consecutiveFailures >= MAX_BYOK_FAILURES && integration.isActive !== false) {
    integration.isActive = false;
    deactivated = true;
  }
  await integration.save();

  if (deactivated) {
    await notify({ userId: integration.userId, integrationId: integration._id, lastFailureReason: reason });
  }
  return { deactivated, consecutiveFailures: integration.consecutiveFailures };
}

// Any successful BYOK call clears the failure streak.
export async function recordByokSuccess(integration) {
  if (!integration) return;
  if ((integration.consecutiveFailures || 0) !== 0) {
    integration.consecutiveFailures = 0;
    integration.lastFailureReason = null;
    await integration.save();
  }
}

const defaultDeps = {
  resolveProvider,
  ledger,
  recordByokFailure,
  recordByokSuccess
};

// Resolve the provider and execute one Dograh call with strict, surfaced billing semantics.
//
// callParams:
//   - action     (default "dograh_call")
//   - callId      REQUIRED — stable id used to derive distinct idempotency keys per mode/phase
//   - performCall({ mode, apiKey, baseUrl, integration }) => result | throws
//                 Caller-supplied; builds the right Dograh client for the mode and performs the
//                 call. Resolves on success, throws on failure.
//   - metadata    optional, copied into UsageLog
//
// Resolution is locked in at the start of the attempt; preferences are never re-checked mid-call.
export async function resolveAndExecuteDograhCall(userId, callParams = {}, depsOverride = {}) {
  const deps = { ...defaultDeps, ...depsOverride };
  const { action = "dograh_call", callId, performCall, metadata = {} } = callParams;

  if (!callId) throw new Error("resolveAndExecuteDograhCall requires a callId for idempotency.");
  if (typeof performCall !== "function") throw new Error("resolveAndExecuteDograhCall requires a performCall function.");

  const resolution = await deps.resolveProvider(userId, action);
  const { cost, platformFee } = resolution;

  if (resolution.mode === "blocked") {
    await deps.ledger.recordUsage({
      userId, action, mode: "blocked", success: false, cost, platformFee,
      callId, error: resolution.reason, metadata
    });
    return {
      success: false,
      mode: "blocked",
      reason: resolution.reason,
      message: "This call can't run: you have no platform credits and no active Dograh key. Buy credits or connect/fix your Dograh key to continue."
    };
  }

  if (resolution.mode === "byok") {
    return executeByok(userId, { action, callId, performCall, metadata, resolution }, deps);
  }

  // platform_credits
  return executePlatformCredits(userId, { action, callId, performCall, metadata, cost }, deps);
}

async function executeByok(userId, { action, callId, performCall, metadata, resolution }, deps) {
  const { integration, apiKey, baseUrl, platformFee, fallbackOnFailure, cost } = resolution;

  let result;
  try {
    result = await performCall({ mode: "byok", apiKey, baseUrl, integration });
  } catch (error) {
    const reason = safeReason(error);
    await deps.recordByokFailure(integration, reason);

    if (!fallbackOnFailure) {
      // Fail closed: no credits touched.
      await deps.ledger.recordUsage({
        userId, action, mode: "byok", success: false, cost, platformFee, creditsCharged: 0,
        integrationId: integration._id, callId, error: reason, metadata
      });
      return {
        success: false,
        mode: "byok",
        error: "BYOK_KEY_FAILED",
        creditsCharged: false,
        message: "Your Dograh key failed for this call. Platform credits were NOT charged. Fix your key or enable credit fallback to retry on credits."
      };
    }

    // Explicit, user-opted-in fallback to platform credits — surfaced via modeSwitched.
    return fallbackToPlatformCredits(userId, { action, callId, performCall, metadata, cost, platformFee, integration }, deps);
  }

  // BYOK success: clear failure streak, charge only the platform fee (allow tiny negative so an
  // already-completed call is never voided for a few credits of fee).
  await deps.recordByokSuccess(integration);
  const charge = await deps.ledger.charge({
    userId, amount: platformFee, action, mode: "byok",
    idempotencyKey: `${callId}:byok:fee`, allowNegative: true,
    metadata: { integrationId: String(integration._id) }
  });
  await deps.ledger.recordUsage({
    userId, action, mode: "byok", success: true, cost, platformFee, creditsCharged: charge.amount || 0,
    integrationId: integration._id, callId, metadata
  });
  return { success: true, mode: "byok", platformFeeCharged: charge.amount || 0, result };
}

async function fallbackToPlatformCredits(userId, { action, callId, performCall, metadata, cost, platformFee, integration }, deps) {
  // Distinct idempotency key from the BYOK fee, per spec.
  const reservation = await deps.ledger.reserve({
    userId, amount: cost, action, idempotencyKey: `${callId}:platform_credits:reserve`,
    metadata: { byokFallback: true }
  });

  if (!reservation.ok) {
    await deps.ledger.recordUsage({
      userId, action, mode: "byok", success: false, cost, platformFee, creditsCharged: 0,
      integrationId: integration._id, callId, error: "BYOK_KEY_FAILED",
      modeSwitched: false, switchReason: "byok_failed_fallback_enabled",
      metadata: { ...metadata, fallbackBlocked: "INSUFFICIENT_CREDITS" }
    });
    return {
      success: false,
      mode: "byok",
      error: "BYOK_KEY_FAILED",
      creditsCharged: false,
      fallbackAttempted: true,
      reason: "INSUFFICIENT_CREDITS_FOR_FALLBACK",
      message: "Your Dograh key failed and you don't have enough platform credits to fall back. No credits were charged."
    };
  }

  let result;
  try {
    result = await performCall({ mode: "platform_credits" });
  } catch (error) {
    await deps.ledger.releaseReservation({ idempotencyKey: `${callId}:platform_credits:reserve` });
    await deps.ledger.recordUsage({
      userId, action, mode: "platform_credits", success: false, cost, creditsCharged: 0,
      callId, error: safeReason(error), modeSwitched: true, switchReason: "byok_failed_fallback_enabled", metadata
    });
    return {
      success: false,
      mode: "platform_credits",
      modeSwitched: true,
      reason: "byok_failed_fallback_enabled",
      error: "PLATFORM_CALL_FAILED",
      creditsCharged: false,
      message: "Your Dograh key failed, so we tried platform credits — but that call also failed. No credits were charged."
    };
  }

  await deps.ledger.confirmReservation({ idempotencyKey: `${callId}:platform_credits:reserve` });
  await deps.ledger.recordUsage({
    userId, action, mode: "platform_credits", success: true, cost, creditsCharged: cost,
    callId, modeSwitched: true, switchReason: "byok_failed_fallback_enabled", metadata
  });
  return {
    success: true,
    mode: "platform_credits",
    modeSwitched: true,
    reason: "byok_failed_fallback_enabled",
    creditsCharged: cost,
    result
  };
}

async function executePlatformCredits(userId, { action, callId, performCall, metadata, cost }, deps) {
  const reservation = await deps.ledger.reserve({
    userId, amount: cost, action, idempotencyKey: `${callId}:platform_credits:reserve`
  });
  if (!reservation.ok) {
    await deps.ledger.recordUsage({
      userId, action, mode: "blocked", success: false, cost, callId, error: "NO_CREDITS", metadata
    });
    return {
      success: false,
      mode: "blocked",
      reason: "NO_CREDITS",
      message: "You don't have enough platform credits to place this call. Buy credits or connect a Dograh key."
    };
  }

  let result;
  try {
    result = await performCall({ mode: "platform_credits" });
  } catch (error) {
    await deps.ledger.releaseReservation({ idempotencyKey: `${callId}:platform_credits:reserve` });
    await deps.ledger.recordUsage({
      userId, action, mode: "platform_credits", success: false, cost, creditsCharged: 0,
      callId, error: safeReason(error), metadata
    });
    return {
      success: false,
      mode: "platform_credits",
      error: "PLATFORM_CALL_FAILED",
      creditsCharged: false,
      message: "The call failed before connecting. Your platform credits were not charged."
    };
  }

  await deps.ledger.confirmReservation({ idempotencyKey: `${callId}:platform_credits:reserve` });
  await deps.ledger.recordUsage({
    userId, action, mode: "platform_credits", success: true, cost, creditsCharged: cost, callId, metadata
  });
  return { success: true, mode: "platform_credits", creditsCharged: cost, result };
}

// Reset failure state when a key is (re)validated or an admin reactivates the connection.
export async function reactivateDograhConnection(integration) {
  integration.isActive = true;
  integration.consecutiveFailures = 0;
  integration.lastFailureReason = null;
  integration.lastFailureAt = null;
  await integration.save();
  return integration;
}

export async function reactivateDograhConnectionById(userId, integrationId) {
  const integration = await UserIntegration.findOne({ _id: integrationId, userId, provider: "dograh" });
  if (!integration) return null;
  return reactivateDograhConnection(integration);
}

export default {
  resolveAndExecuteDograhCall,
  recordByokFailure,
  recordByokSuccess,
  reactivateDograhConnection,
  reactivateDograhConnectionById
};
