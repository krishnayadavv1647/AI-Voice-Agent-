import assert from "node:assert/strict";
import { mock, test } from "node:test";

import CallLog from "../src/models/CallLog.js";
import Lead from "../src/models/Lead.js";
import { runPipelinePass } from "../src/services/pipelineScheduler.js";

test("pipeline pass does not poll provider-error call logs without transcripts", async () => {
  const callLog = {
    _id: "507f1f77bcf86cd799439011",
    createdAt: new Date(Date.now() - 60_000),
    rawProviderStatus: "pipeline_error",
    status: "pipeline_error"
  };
  const updates = [];

  mock.method(CallLog, "updateMany", async () => ({}));
  mock.method(Lead, "exists", async () => false);
  mock.method(CallLog, "find", () => ({
    limit: async () => []
  }));
  mock.method(CallLog, "findByIdAndUpdate", async (id, update) => {
    updates.push({ id, update });
    return null;
  });

  await runPipelinePass({ scopedCallIds: [callLog._id] });

  assert.equal(updates.length, 0);
});
