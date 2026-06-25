import { planAllowsFeature } from "../../config/plans.js";
import { ApiError } from "../../utils/apiError.js";

export function creditEnforcementEnabled() {
  return process.env.CREDIT_ENFORCEMENT === "true";
}

// Returns a structured decision (no throw) about whether a user's plan unlocks a feature.
// Credit BALANCE is enforced separately by the ledger when the feature actually burns credits;
// this only governs plan/feature entitlement.
export function evaluateFeatureAccess(user, featureKey) {
  if (!creditEnforcementEnabled()) return { allowed: true, enforced: false };

  if (user?.role === "super_admin") {
    return { allowed: true, enforced: true, reason: "SUPER_ADMIN_BYPASS" };
  }

  if (!user || user.planStatus !== "active") {
    return {
      allowed: false,
      enforced: true,
      reason: "NO_ACTIVE_PLAN",
      message: "You don't have an active plan. Choose a plan to start using this feature."
    };
  }
  if (!planAllowsFeature(user.plan, featureKey)) {
    return {
      allowed: false,
      enforced: true,
      reason: "FEATURE_NOT_IN_PLAN",
      message: `Your ${user.plan} plan doesn't include this feature. Upgrade to unlock it.`
    };
  }
  return { allowed: true, enforced: true };
}

// Throwing variant for use at feature entry points.
export function assertFeatureUsable(user, featureKey) {
  const decision = evaluateFeatureAccess(user, featureKey);
  if (!decision.allowed) {
    throw new ApiError(decision.reason === "NO_ACTIVE_PLAN" ? 402 : 403, decision.message, {
      code: decision.reason
    });
  }
  return decision;
}

export default { creditEnforcementEnabled, evaluateFeatureAccess, assertFeatureUsable };
