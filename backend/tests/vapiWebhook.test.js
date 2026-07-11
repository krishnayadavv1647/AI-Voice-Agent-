import assert from "node:assert/strict";
import mongoose from "mongoose";
import { test, mock } from "node:test";

import { extractVapiCallFields, mapVapiEndedReasonToStatus } from "../src/services/callLogMapper.js";
import { processVapiEndOfCall, applyVapiStatusUpdate, vapiWebhook } from "../src/controllers/vapiWebhook.controller.js";
import RealCallLog from "../src/models/CallLog.js";
import { applyCallOutcomeToLog, scheduleRetryFollowUpForCall } from "../src/services/callOutcome.service.js";
import { syncCampaignRecipientFromCall } from "../src/services/campaign.service.js";
import { settleVoiceCallBilling } from "../src/services/billing/voiceCallBilling.service.js";
import { autoGenerateLeadFromCall } from "../src/services/leadGeneration.service.js";
import { normalizeLeadToEnglish } from "../src/services/leadEnglishNormalizer.js";

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

// ---- Change 2: undefined model resilience ----------------------------------

test("processVapiEndOfCall does not throw and logs when the CallLog model is unavailable", async () => {
  const agentId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
  const agent = { _id: agentId, userId: "user_1", totalCalls: 0, totalLeads: 0, save: async () => {} };
  const { deps, created } = makeDeps({ agent });
  delete deps.CallLog; // simulate the circular-import undefined binding

  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  // Force the mongoose-registry fallback to also miss, so the model truly resolves to undefined.
  const modelMock = mock.method(mongoose, "model", () => { throw new Error("not registered"); });

  let result;
  try {
    result = await processVapiEndOfCall(endOfCallMessage(), deps);
  } finally {
    console.error = originalError;
    modelMock.mock.restore();
  }

  assert.equal(result.matched, false, "returns a non-throwing result");
  assert.equal(created.callLogs.length, 0, "no CallLog work attempted");
  const logged = errors.map((e) => JSON.stringify(e)).join("\n");
  assert.match(logged, /model unavailable/);
  assert.match(logged, /CallLog/);
});

test("applyVapiStatusUpdate resolves CallLog from the mongoose registry when deps lacks it", async () => {
  const message = { type: "status-update", status: "in-progress", call: { id: "vapi_call_x" } };

  let updateArgs = null;
  const originalUpdateOne = RealCallLog.updateOne;
  RealCallLog.updateOne = async (...args) => { updateArgs = args; return { acknowledged: true }; };

  try {
    // deps has no CallLog → resolveModel falls back to mongoose.model("CallLog") (registered on import).
    await applyVapiStatusUpdate(message, {});
  } finally {
    RealCallLog.updateOne = originalUpdateOne;
  }

  assert.ok(updateArgs, "updateOne should have been called via the registered model");
  assert.equal(updateArgs[0].providerCallId, "vapi_call_x");
  assert.deepEqual(updateArgs[1], { $set: { rawProviderStatus: "in-progress" } });
});

// ---- PART A: deps=next (Express arg collision) + circular-import resilience -----------------
// Root cause: the route is `router.post("/webhook", vapiWebhook)`, so Express calls the handler as
// `vapiWebhook(req, res, next)` and the positional `deps` is actually `next`. Every raw `deps.X`
// is therefore undefined at request time. resolveModel already saved model access; resolveFn now
// does the same for the imported functions.

function makeRes() {
  const r = { statusCode: null, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = () => {};
  return r;
}

test("resolveFn module fallbacks are all real functions (so deps=next still runs billing + leads)", () => {
  const fallbacks = {
    applyCallOutcomeToLog,
    scheduleRetryFollowUpForCall,
    syncCampaignRecipientFromCall,
    settleVoiceCallBilling,
    autoGenerateLeadFromCall,
    normalizeLeadToEnglish
  };
  for (const [name, fn] of Object.entries(fallbacks)) {
    assert.equal(typeof fn, "function", `${name} must be a real function at request time (not undefined)`);
  }
});

test("webhook default case does NOT crash when deps is Express `next` and WebhookEvent is unavailable", async () => {
  const req = { body: { message: { type: "speech-update", foo: 1 } }, headers: {} };
  const res = makeRes();
  const next = () => {}; // exactly what Express passes as the 3rd arg -> this is `deps`
  // Force the mongoose-registry fallback to also miss, so WebhookEvent truly resolves to undefined.
  const modelMock = mock.method(mongoose, "model", () => { throw new Error("not registered"); });
  try {
    await vapiWebhook(req, res, next);
  } finally {
    modelMock.mock.restore();
  }
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true }, "guarded clean skip — not the catch/warning path (no TypeError)");
});

test("webhook default case stores the event when a model is resolvable", async () => {
  const events = [];
  const deps = { WebhookEvent: { create: async (d) => { events.push(d); return d; } } };
  const req = { body: { message: { type: "conversation-update" } }, headers: {} };
  const res = makeRes();
  await vapiWebhook(req, res, deps);
  assert.equal(res.statusCode, 200);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, "conversation-update");
});

