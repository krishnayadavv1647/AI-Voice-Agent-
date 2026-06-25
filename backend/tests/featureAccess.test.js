import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFeatureAccess } from "../src/services/billing/featureAccess.service.js";

test("super admin bypasses plan entitlement when credit enforcement is enabled", () => {
  const previous = process.env.CREDIT_ENFORCEMENT;
  process.env.CREDIT_ENFORCEMENT = "true";

  try {
    const regularUser = evaluateFeatureAccess({ role: "user", planStatus: "inactive", plan: "starter" }, "lead_search");
    assert.equal(regularUser.allowed, false);
    assert.equal(regularUser.reason, "NO_ACTIVE_PLAN");

    const superAdmin = evaluateFeatureAccess({ role: "super_admin", planStatus: "inactive", plan: "starter" }, "lead_search");
    assert.equal(superAdmin.allowed, true);
    assert.equal(superAdmin.reason, "SUPER_ADMIN_BYPASS");
  } finally {
    if (previous === undefined) delete process.env.CREDIT_ENFORCEMENT;
    else process.env.CREDIT_ENFORCEMENT = previous;
  }
});
