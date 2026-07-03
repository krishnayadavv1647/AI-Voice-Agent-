import assert from "node:assert/strict";
import mongoose from "mongoose";
import { test } from "node:test";

import { extractVapiCallFields, mapVapiEndedReasonToStatus } from "../src/services/callLogMapper.js";
import { processVapiEndOfCall } from "../src/controllers/vapiWebhook.controller.js";

// ---- extractVapiCallFields (pure) ------------------------------------------

test("extractVapiCallFields maps call.id -> providerCallId and endedReason -> valid raw status", () => {
  const message = {
    type: "end-of-call-report",
    endedReason: "customer-ended-call",
    startedAt: "2026-01-01T10:00:00.000Z",
    endedAt: "2026-01-01T10:02:00.000Z",
    call: {
      id: "vapi_call_123",
      type: "outboundPhoneCall",
      assistantId: "asst_9",
      metadata: { localAgentId: "agent_1", userId: "user_1" },
      customer: { number: "+17578297060" },
      phoneNumber: { number: "+12025550000" }
    },
    artifact: { transcript: "hello world", recordingUrl: "https://rec" },
    analysis: { summary: "a summary" }
  };

  const fields = extractVapiCallFields(message);
  assert.equal(fields.providerCallId, "vapi_call_123");
  assert.equal(fields.localAgentId, "agent_1");
  assert.equal(fields.userId, "user_1");
  assert.equal(fields.providerAgentId, "asst_9");
  assert.equal(fields.callerNumber, "+17578297060");
  assert.equal(fields.callingNumber, "+12025550000");
  assert.equal(fields.status, "completed");
  assert.equal(fields.transcript, "hello world");
  assert.equal(fields.summary, "a summary");
  assert.equal(fields.recordingUrl, "https://rec");
  assert.equal(fields.callDirection, "outbound");
  assert.equal(fields.durationSeconds, 120, "computed from started/ended when not supplied");
});

test("mapVapiEndedReasonToStatus maps known reasons to enum-friendly raw statuses", () => {
  assert.equal(mapVapiEndedReasonToStatus("customer-ended-call"), "completed");
  assert.equal(mapVapiEndedReasonToStatus("assistant-ended-call"), "completed");
  assert.equal(mapVapiEndedReasonToStatus("no-answer"), "no_answer");
  assert.equal(mapVapiEndedReasonToStatus("customer-did-not-answer"), "no_answer");
  assert.equal(mapVapiEndedReasonToStatus("busy"), "busy");
  assert.equal(mapVapiEndedReasonToStatus("pipeline-error-something"), "failed");
  assert.equal(mapVapiEndedReasonToStatus(""), "completed");
});

// ---- fakes for processVapiEndOfCall ----------------------------------------

function queryable(doc) {
  return { sort: async () => doc };
}

function makeDeps({ agent = null, seededCallLog = null } = {}) {
  const created = { callLogs: [], leads: [], webhookEvents: [], billingSettled: [], outcomeApplied: [] };
  const callLogStore = seededCallLog ? [seededCallLog] : [];

  const deps = {
    Agent: {
      findById: async (id) => (agent && String(agent._id) === String(id) ? agent : null),
      findOne: async () => null
    },
    CallLog: {
      findOne: (query) => {
        const match = callLogStore.find((c) =>
          (!query.providerCallId || c.providerCallId === query.providerCallId) &&
          (!query.agentId || String(c.agentId) === String(query.agentId))
        );
        return queryable(match || null);
      },
      create: async (doc) => {
        const created2 = { ...doc, _id: "new_call", save: async () => {} };
        created.callLogs.push(created2);
        callLogStore.push(created2);
        return created2;
      },
      countDocuments: async () => callLogStore.length
    },
    Lead: {
      findOne: async () => null,
      create: async (doc) => { created.leads.push(doc); return doc; }
    },
    User: { findByIdAndUpdate: async () => {} },
    WebhookEvent: { create: async (doc) => { created.webhookEvents.push(doc); return doc; } },
    applyCallOutcomeToLog: async (log, status) => { created.outcomeApplied.push(status); log.normalizedStatus = "completed"; },
    scheduleRetryFollowUpForCall: async () => {},
    syncCampaignRecipientFromCall: async () => {},
    settleVoiceCallBilling: async (log) => { created.billingSettled.push(log._id); },
    autoGenerateLeadFromCall: async () => {},
    normalizeLeadToEnglish: (lead) => lead
  };

  return { deps, created };
}

function endOfCallMessage(overrides = {}) {
  return {
    type: "end-of-call-report",
    endedReason: "customer-ended-call",
    durationSeconds: 90,
    call: {
      id: "vapi_call_1",
      type: "outboundPhoneCall",
      assistantId: "asst_1",
      metadata: { localAgentId: "507f1f77bcf86cd799439011", userId: "user_1" },
      customer: { number: "+17578297060" }
    },
    artifact: { transcript: "t" },
    analysis: {},
    ...overrides
  };
}

// ---- chain: matched agent + seeded initiated CallLog -----------------------

test("end-of-call-report updates a pre-seeded initiated CallLog and settles billing", async () => {
  const agentId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
  const agent = { _id: agentId, userId: "user_1", totalCalls: 0, totalLeads: 0, save: async () => {} };

  const seededCallLog = {
    _id: "seeded_1",
    agentId,
    providerCallId: "vapi_call_1",
    status: "initiated",
    save: async () => {}
  };

  const { deps, created } = makeDeps({ agent, seededCallLog });
  const result = await processVapiEndOfCall(endOfCallMessage(), deps);

  assert.equal(result.matched, true);
  assert.equal(result.callLog._id, "seeded_1", "matched the seeded log, did not create a new one");
  assert.equal(created.callLogs.length, 0, "no new CallLog created");
  assert.equal(seededCallLog.source, "vapi");
  assert.equal(seededCallLog.providerCallId, "vapi_call_1");
  assert.deepEqual(created.outcomeApplied, ["completed"]);
  assert.deepEqual(created.billingSettled, ["seeded_1"], "settleVoiceCallBilling called with the log");
  assert.equal(created.webhookEvents.length, 1);
  assert.equal(created.webhookEvents[0].provider, "vapi");
  assert.equal(created.webhookEvents[0].matchedCallLogId, "seeded_1");
});

test("no matching log creates one (web/test call path)", async () => {
  const agentId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
  const agent = { _id: agentId, userId: "user_1", totalCalls: 0, totalLeads: 0, save: async () => {} };

  const { deps, created } = makeDeps({ agent });
  const result = await processVapiEndOfCall(endOfCallMessage({ call: { id: "web_1", type: "webCall", metadata: { localAgentId: "507f1f77bcf86cd799439011", userId: "user_1" } } }), deps);

  assert.equal(result.matched, true);
  assert.equal(created.callLogs.length, 1, "created a CallLog");
  assert.equal(created.callLogs[0].source, "vapi");
  assert.equal(created.callLogs[0].callDirection, "web");
});

// ---- chain: unmatched agent ------------------------------------------------

test("unmatched agent records a WebhookEvent and reports matched:false", async () => {
  const { deps, created } = makeDeps({ agent: null });
  const result = await processVapiEndOfCall(endOfCallMessage(), deps);

  assert.equal(result.matched, false);
  assert.equal(created.webhookEvents.length, 1);
  assert.equal(created.webhookEvents[0].provider, "vapi");
  assert.equal(created.callLogs.length, 0);
});
