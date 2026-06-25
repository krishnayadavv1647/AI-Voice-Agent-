import assert from "node:assert/strict";
import { mock, test } from "node:test";

import Agent from "../src/models/Agent.js";
import Lead from "../src/models/Lead.js";
import { autoGenerateLeadFromCall } from "../src/services/leadGeneration.service.js";

test("autoGenerateLeadFromCall creates a basic lead from caller number when transcript extraction has no data", async () => {
  const createdLead = { _id: "lead_1", phone: "+15551234567" };
  const saves = [];

  mock.method(Lead, "findOne", async () => null);
  mock.method(Lead, "create", async (payload) => {
    assert.equal(payload.phone, "+15551234567");
    assert.equal(payload.source, "call");
    assert.equal(payload.status, "New");
    return createdLead;
  });
  mock.method(Agent, "findByIdAndUpdate", async (agentId, update) => {
    assert.equal(agentId, "agent_1");
    assert.deepEqual(update, { $inc: { totalLeads: 1 } });
  });

  const callLog = {
    _id: "call_1",
    userId: "user_1",
    agentId: "agent_1",
    callerNumber: "+15551234567",
    leadCaptured: false,
    leadData: null,
    async save() {
      saves.push({
        leadCaptured: this.leadCaptured,
        leadData: this.leadData,
        leadId: this.leadId
      });
    }
  };

  const result = await autoGenerateLeadFromCall(callLog);

  assert.equal(result.lead, createdLead);
  assert.equal(callLog.leadCaptured, true);
  assert.equal(callLog.leadId, "lead_1");
  assert.equal(callLog.leadData.phone, "+15551234567");
  assert.equal(saves.length, 1);
});
