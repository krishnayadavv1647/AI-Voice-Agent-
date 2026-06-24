import assert from "node:assert/strict";
import { test } from "node:test";

import { decideProviderMode, isOwnKeyActive } from "../src/services/billing/providerResolver.service.js";
import {
  resolveAndExecuteDograhCall,
  recordByokFailure,
  reactivateDograhConnection
} from "../src/services/billing/dograhCallExecutor.service.js";

const COST = 10;
const FEE = 1;

// ---- Fakes -----------------------------------------------------------------

function fakeIntegration(overrides = {}) {
  return {
    _id: "int_1",
    userId: "user_1",
    status: "connected",
    isActive: true,
    apiKeyEncrypted: "enc",
    preferOwnKey: false,
    fallbackOnFailure: false,
    consecutiveFailures: 0,
    lastFailureReason: null,
    lastFailureAt: null,
    async save() {},
    ...overrides
  };
}

// In-memory ledger that tracks balance + reservations so charges/refunds are assertable.
function fakeLedger(startBalance) {
  const state = { balance: startBalance, reservations: new Map(), usage: [], calls: { reserve: 0, charge: 0, confirm: 0, release: 0 } };
  return {
    state,
    async getBalance() { return state.balance; },
    async reserve({ amount, idempotencyKey }) {
      state.calls.reserve += 1;
      if (state.reservations.has(idempotencyKey)) return { ok: true, reused: true, amount };
      if (state.balance < amount) return { ok: false, reason: "INSUFFICIENT_CREDITS" };
      state.balance -= amount;
      state.reservations.set(idempotencyKey, { amount, status: "reserved" });
      return { ok: true, amount };
    },
    async confirmReservation({ idempotencyKey }) {
      state.calls.confirm += 1;
      const r = state.reservations.get(idempotencyKey);
      if (r) r.status = "confirmed";
      return { ok: true };
    },
    async releaseReservation({ idempotencyKey }) {
      state.calls.release += 1;
      const r = state.reservations.get(idempotencyKey);
      if (r && r.status === "reserved") { state.balance += r.amount; r.status = "released"; }
      return { ok: true };
    },
    async charge({ amount, allowNegative }) {
      state.calls.charge += 1;
      if (!allowNegative && state.balance < amount) return { ok: false, reason: "INSUFFICIENT_CREDITS" };
      state.balance -= amount;
      return { ok: true, amount };
    },
    async recordUsage(entry) { state.usage.push(entry); return entry; }
  };
}

function executorDeps(ledger, resolution) {
  return {
    ledger,
    resolveProvider: async () => resolution,
    recordByokFailure: async (integration) => {
      integration.consecutiveFailures = (integration.consecutiveFailures || 0) + 1;
    },
    recordByokSuccess: async (integration) => { integration.consecutiveFailures = 0; }
  };
}

// ---- decideProviderMode matrix (checklist 1-4) -----------------------------

test("credits available, no preference -> platform_credits", () => {
  const d = decideProviderMode({ balance: 100, cost: COST, platformFee: FEE, ownKeyActive: true, preferOwnKey: false });
  assert.equal(d.mode, "platform_credits");
});

test("credits available, preferOwnKey -> byok", () => {
  const d = decideProviderMode({ balance: 100, cost: COST, platformFee: FEE, ownKeyActive: true, preferOwnKey: true });
  assert.equal(d.mode, "byok");
});

test("credits exhausted, no own key -> blocked", () => {
  const d = decideProviderMode({ balance: 0, cost: COST, platformFee: FEE, ownKeyActive: false, preferOwnKey: false });
  assert.equal(d.mode, "blocked");
  assert.equal(d.reason, "NO_CREDITS_NO_KEY");
});

test("credits exhausted, own key connected -> byok automatically", () => {
  const d = decideProviderMode({ balance: 0, cost: COST, platformFee: FEE, ownKeyActive: true, preferOwnKey: false });
  assert.equal(d.mode, "byok");
});

test("isOwnKeyActive: disconnected / inactive / keyless key is not active", () => {
  assert.equal(isOwnKeyActive(fakeIntegration()), true);
  assert.equal(isOwnKeyActive(fakeIntegration({ status: "disconnected" })), false);
  assert.equal(isOwnKeyActive(fakeIntegration({ isActive: false })), false);
  assert.equal(isOwnKeyActive(fakeIntegration({ apiKeyEncrypted: "" })), false);
  assert.equal(isOwnKeyActive(null), false);
});

// ---- Executor: fail-closed BYOK (checklist 5) ------------------------------

test("preferOwnKey, key fails, fallbackOnFailure=false -> error, credits untouched", async () => {
  const integration = fakeIntegration({ preferOwnKey: true, fallbackOnFailure: false });
  const ledger = fakeLedger(500);
  const resolution = { mode: "byok", action: "dograh_call", cost: COST, platformFee: FEE, integration, apiKey: "k", baseUrl: "b", fallbackOnFailure: false };

  const res = await resolveAndExecuteDograhCall("user_1", {
    callId: "call_1",
    performCall: async () => { throw new Error("401 rejected"); }
  }, executorDeps(ledger, resolution));

  assert.equal(res.success, false);
  assert.equal(res.error, "BYOK_KEY_FAILED");
  assert.equal(res.creditsCharged, false);
  assert.equal(ledger.state.balance, 500, "balance must be unchanged");
  assert.equal(ledger.state.calls.reserve, 0, "no reservation should be made");
  assert.equal(ledger.state.calls.charge, 0, "no charge should be made");
});

// ---- Executor: opt-in fallback (checklist 6) -------------------------------

test("preferOwnKey, key fails, fallbackOnFailure=true, credits available -> fallback charges credits, modeSwitched", async () => {
  const integration = fakeIntegration({ preferOwnKey: true, fallbackOnFailure: true });
  const ledger = fakeLedger(500);
  const resolution = { mode: "byok", action: "dograh_call", cost: COST, platformFee: FEE, integration, apiKey: "k", baseUrl: "b", fallbackOnFailure: true };

  const res = await resolveAndExecuteDograhCall("user_1", {
    callId: "call_2",
    performCall: async ({ mode }) => {
      if (mode === "byok") throw new Error("timeout");
      return { ok: true };
    }
  }, executorDeps(ledger, resolution));

  assert.equal(res.success, true);
  assert.equal(res.mode, "platform_credits");
  assert.equal(res.modeSwitched, true);
  assert.equal(res.reason, "byok_failed_fallback_enabled");
  assert.equal(res.creditsCharged, COST);
  assert.equal(ledger.state.balance, 500 - COST, "credits charged exactly once");
  assert.equal(ledger.state.calls.confirm, 1);
});

test("fallback enabled but platform call also fails -> credits released, no charge", async () => {
  const integration = fakeIntegration({ preferOwnKey: true, fallbackOnFailure: true });
  const ledger = fakeLedger(500);
  const resolution = { mode: "byok", action: "dograh_call", cost: COST, platformFee: FEE, integration, apiKey: "k", baseUrl: "b", fallbackOnFailure: true };

  const res = await resolveAndExecuteDograhCall("user_1", {
    callId: "call_3",
    performCall: async () => { throw new Error("everything down"); }
  }, executorDeps(ledger, resolution));

  assert.equal(res.success, false);
  assert.equal(res.modeSwitched, true);
  assert.equal(ledger.state.balance, 500, "released reservation restores balance");
  assert.equal(ledger.state.calls.release, 1);
});

// ---- Executor: platform_credits happy path + failure -----------------------

test("platform_credits success -> reserve then confirm, credits charged", async () => {
  const ledger = fakeLedger(50);
  const resolution = { mode: "platform_credits", action: "dograh_call", cost: COST, platformFee: FEE, integration: null };

  const res = await resolveAndExecuteDograhCall("user_1", {
    callId: "call_4",
    performCall: async () => ({ ok: true })
  }, executorDeps(ledger, resolution));

  assert.equal(res.success, true);
  assert.equal(res.creditsCharged, COST);
  assert.equal(ledger.state.balance, 50 - COST);
  assert.equal(ledger.state.calls.confirm, 1);
});

test("platform_credits call failure -> reservation released, no charge", async () => {
  const ledger = fakeLedger(50);
  const resolution = { mode: "platform_credits", action: "dograh_call", cost: COST, platformFee: FEE, integration: null };

  const res = await resolveAndExecuteDograhCall("user_1", {
    callId: "call_5",
    performCall: async () => { throw new Error("provider 500"); }
  }, executorDeps(ledger, resolution));

  assert.equal(res.success, false);
  assert.equal(res.creditsCharged, false);
  assert.equal(ledger.state.balance, 50, "balance restored after release");
});

// ---- Executor: blocked ------------------------------------------------------

test("blocked mode never calls performCall", async () => {
  const ledger = fakeLedger(0);
  const resolution = { mode: "blocked", reason: "NO_CREDITS_NO_KEY", action: "dograh_call", cost: COST, platformFee: FEE, integration: null };
  let called = false;

  const res = await resolveAndExecuteDograhCall("user_1", {
    callId: "call_6",
    performCall: async () => { called = true; return {}; }
  }, executorDeps(ledger, resolution));

  assert.equal(res.success, false);
  assert.equal(res.mode, "blocked");
  assert.equal(called, false, "Dograh must not be called when blocked");
});

// ---- Failure tracking & reactivation (checklist 7 & 8) ---------------------

test("3 consecutive BYOK failures auto-deactivate and notify once", async () => {
  const integration = fakeIntegration();
  const notifications = [];
  const notify = async (payload) => { notifications.push(payload); };

  await recordByokFailure(integration, "401", { notify });
  assert.equal(integration.isActive, true);
  await recordByokFailure(integration, "401", { notify });
  assert.equal(integration.isActive, true);
  const third = await recordByokFailure(integration, "401", { notify });

  assert.equal(third.deactivated, true);
  assert.equal(integration.isActive, false);
  assert.equal(integration.consecutiveFailures, 3);
  assert.equal(notifications.length, 1, "notification queued exactly once");
});

test("reactivation resets failure count and isActive", async () => {
  const integration = fakeIntegration({ isActive: false, consecutiveFailures: 5, lastFailureReason: "401" });
  await reactivateDograhConnection(integration);
  assert.equal(integration.isActive, true);
  assert.equal(integration.consecutiveFailures, 0);
  assert.equal(integration.lastFailureReason, null);
});
