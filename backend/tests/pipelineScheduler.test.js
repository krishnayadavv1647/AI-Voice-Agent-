import assert from "node:assert/strict";
import { mock, test } from "node:test";

import CallLog from "../src/models/CallLog.js";
import { runPipelinePass } from "../src/services/pipelineScheduler.js";

test("pipeline pass stops retrying Dograh pipeline_error call logs", async () => {
  const callLog = {
    _id: { toString: () => "call_1" },
    createdAt: new Date(Date.now() - 60_000),
    rawProviderStatus: "pipeline_error",
    status: "pipeline_error"
  };
  const updates = [];

  mock.method(CallLog, "updateMany", async () => ({}));
  mock.method(CallLog, "find", () => ({
    limit: async () => (updates.length === 0 ? [callLog] : [])
  }));
  mock.method(CallLog, "findByIdAndUpdate", async (id, update) => {
    updates.push({ id, update });
    return null;
  });

  await runPipelinePass({ scopedCallIds: [callLog._id] });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].update.$set.pipelineStatus, "failed");
  assert.equal(updates[0].update.$set.autoSyncFailureCount, 5);
  assert.match(updates[0].update.$set.lastPipelineError, /re-sync the agent runtime/i);
});
