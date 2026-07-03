import assert from "node:assert/strict";
import { mock, test } from "node:test";

import FollowUp from "../src/models/FollowUp.js";
import {
  applyCallOutcomeToLog,
  isPipelineErrorStatus,
  isTerminalCallStatus,
  normalizeCallOutcome,
  scheduleRetryFollowUpForCall
} from "../src/services/callOutcome.service.js";

test("ended in-progress call is finalized as completed", async () => {
  mock.method(FollowUp, "findOne", async () => null);
  const endedAt = new Date("2026-06-25T10:00:00.000Z");
  const callLog = {
    _id: "call_1",
    userId: "user_1",
    status: "in-progress",
    endedAt
  };

  await applyCallOutcomeToLog(callLog, "in-progress", { endedAt });

  assert.equal(callLog.normalizedStatus, "completed");
  assert.equal(callLog.outcome, "completed");
  assert.equal(callLog.retryEligible, false);
  assert.equal(callLog.callEndedAt, endedAt);
});

test("Dograh pipeline_error normalizes to terminal failed status", async () => {
  mock.method(FollowUp, "findOne", async () => null);
  const callLog = {
    _id: "call_2",
    userId: "user_1",
    status: "pipeline_error"
  };

  await applyCallOutcomeToLog(callLog, "pipeline_error");

  assert.equal(normalizeCallOutcome("pipeline_error"), "failed");
  assert.equal(callLog.normalizedStatus, "failed");
  assert.equal(callLog.outcome, "failed");
  assert.equal(callLog.retryEligible, true);
  assert.equal(isTerminalCallStatus(callLog.normalizedStatus), true);
});

test("Dograh pipeline error variants do not schedule retry follow-ups", async () => {
  const findOne = mock.method(FollowUp, "findOne", async () => {
    throw new Error("retry lookup should not run for pipeline errors");
  });
  const callLog = {
    _id: "call_3",
    userId: "user_1",
    agentId: "agent_1",
    callerNumber: "+15551234567",
    rawProviderStatus: "pipeline error",
    normalizedStatus: "failed",
    retryEligible: true
  };

  const result = await scheduleRetryFollowUpForCall(callLog);

  assert.equal(isPipelineErrorStatus("pipeline error"), true);
  assert.equal(isPipelineErrorStatus("pipeline-error"), true);
  assert.equal(result, null);
  assert.equal(findOne.mock.callCount(), 0);
});
