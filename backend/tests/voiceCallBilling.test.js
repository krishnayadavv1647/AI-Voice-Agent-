import assert from "node:assert/strict";
import { test } from "node:test";

import { computeReservation, computeVoiceCharge } from "../src/services/billing/voiceCallBilling.service.js";

const PER_MIN = 10;
const FEE = 1;

// ---- computeReservation ----------------------------------------------------

test("reservation blocked when balance can't cover one minute", () => {
  const r = computeReservation({ balance: 5, perMinute: PER_MIN, estimateMinutes: 5 });
  assert.equal(r.blocked, true);
  assert.equal(r.amount, 0);
});

test("reservation uses the estimate when balance is plentiful", () => {
  const r = computeReservation({ balance: 200, perMinute: PER_MIN, estimateMinutes: 5 });
  assert.equal(r.blocked, false);
  assert.equal(r.reserveMinutes, 5);
  assert.equal(r.amount, 50);
});

test("reservation caps at what the balance can afford", () => {
  const r = computeReservation({ balance: 30, perMinute: PER_MIN, estimateMinutes: 5 });
  assert.equal(r.blocked, false);
  assert.equal(r.reserveMinutes, 3);
  assert.equal(r.amount, 30);
});

test("reservation with zero per-minute price never blocks and reserves nothing", () => {
  const r = computeReservation({ balance: 0, perMinute: 0, estimateMinutes: 5 });
  assert.equal(r.blocked, false);
  assert.equal(r.amount, 0);
});

// ---- computeVoiceCharge ----------------------------------------------------

test("completed 90s call rounds up to 2 minutes and is billable", () => {
  const c = computeVoiceCharge({ durationSeconds: 90, normalizedStatus: "completed", perMinute: PER_MIN, platformFee: FEE });
  assert.equal(c.minutes, 2);
  assert.equal(c.billable, true);
  assert.equal(c.platformCost, 20);
  assert.equal(c.byokFee, 2);
});

test("answered 1s call bills a minimum of 1 minute", () => {
  const c = computeVoiceCharge({ durationSeconds: 1, normalizedStatus: "answered", perMinute: PER_MIN, platformFee: FEE });
  assert.equal(c.minutes, 1);
  assert.equal(c.platformCost, 10);
});

test("no-answer call has zero billable time", () => {
  const c = computeVoiceCharge({ durationSeconds: 0, normalizedStatus: "no_answer", perMinute: PER_MIN, platformFee: FEE });
  assert.equal(c.minutes, 0);
  assert.equal(c.billable, false);
  assert.equal(c.platformCost, 0);
});

test("failed call with leftover duration is still not billable", () => {
  const c = computeVoiceCharge({ durationSeconds: 50, normalizedStatus: "failed", perMinute: PER_MIN, platformFee: FEE });
  assert.equal(c.billable, false);
  assert.equal(c.platformCost, 0);
});
