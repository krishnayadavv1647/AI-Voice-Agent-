import assert from "node:assert/strict";
import { mock, test } from "node:test";

import axios from "axios";

import Agent from "../src/models/Agent.js";
import AgentVoiceConfiguration from "../src/models/AgentVoiceConfiguration.js";
import CallLog from "../src/models/CallLog.js";
import FollowUp from "../src/models/FollowUp.js";
import TelephonyConfig from "../src/models/TelephonyConfig.js";
import { VapiProvider } from "../src/providers/vapi.provider.js";
import { triggerOutboundCallForAgent } from "../src/services/outboundCall.service.js";
import { ApiError } from "../src/utils/apiError.js";

function fakeAgent(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    userId: "507f1f77bcf86cd799439012",
    dograhWorkflowUuid: "workflow_uuid_1",
    dograhWorkflowId: "workflow_1",
    callerIdNumber: "+17578297060",
    workflowSyncStatus: "synced",
    businessName: "Acme",
    agentName: "Support",
    ...overrides
  };
}

test("triggerOutboundCallForAgent returns a 400 when Dograh voice is not verified", async () => {
  mock.method(AgentVoiceConfiguration, "findOne", async () => ({
    ttsProvider: "cartesia",
    ttsModel: "sonic-3.5",
    ttsVoiceId: "voice_123",
    sttProvider: "dograh_default",
    dograhSyncStatus: "configuration_required",
    dograhSyncError: "Dograh voice settings are not verified yet."
  }));

  await assert.rejects(
    () => triggerOutboundCallForAgent({
      agent: fakeAgent(),
      userId: "507f1f77bcf86cd799439012",
      phoneNumber: "+17578297061",
      trigger: async () => {
        throw new Error("Dograh trigger should not be called before voice verification.");
      }
    }),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.statusCode, 400);
      assert.equal(error.details?.code, "DOGRAH_VOICE_NOT_VERIFIED");
      assert.equal(error.details?.configurationRequired, true);
      assert.match(error.message, /Verify with Dograh|voice provider/i);
      return true;
    }
  );
});

test("non-Dograh agent routes through the provider and writes providerCallId (no Dograh path)", async (t) => {
  // getProvider("vapi") returns the VapiProvider object by reference, so mocking its method here
  // is what the outbound seam invokes.
  mock.method(VapiProvider, "startCall", async (agent, payload) => {
    assert.equal(payload.phoneNumber, "+17578297061");
    return { provider: "vapi", providerCallId: "vapi_call_xyz", status: "call_started", raw: { id: "vapi_call_xyz" } };
  });

  let createdDoc = null;
  mock.method(CallLog, "create", async (doc) => {
    createdDoc = { ...doc, _id: "log_1", save: async () => {} };
    return createdDoc;
  });
  // applyCallOutcomeToLog -> syncAppointmentCallOutcome looks up a FollowUp; keep it DB-free.
  mock.method(FollowUp, "findOne", async () => null);

  const result = await triggerOutboundCallForAgent({
    // No dograhWorkflowUuid on purpose: a Vapi agent never has one. vapiPhoneNumberId is a valid
    // UUID so the auto-provision step short-circuits (no telephony/Vapi lookup).
    agent: { _id: "507f1f77bcf86cd799439011", userId: "507f1f77bcf86cd799439012", provider: "vapi", providerAgentId: "asst_1", vapiPhoneNumberId: "11111111-2222-3333-4444-555555555555", callerIdNumber: "+17578297060", agentName: "Support", businessName: "Acme" },
    userId: "507f1f77bcf86cd799439012",
    phoneNumber: "+17578297061"
  });

  assert.equal(result.dograhResponse.providerCallId, "vapi_call_xyz");
  assert.equal(result.dograhResponse.status, "initiated");
  assert.equal(createdDoc.providerCallId, "vapi_call_xyz");
  assert.equal(createdDoc.source, "vapi");
  assert.equal(createdDoc.callDirection, "outbound");
  assert.equal(createdDoc.status, "initiated");
});

test("agent with stale Vapi provider but Dograh workflow ids uses Dograh readiness path", async () => {
  const vapiStartCall = mock.method(VapiProvider, "startCall", async () => {
    throw new Error("Vapi should not be used when Dograh workflow ids are present.");
  });
  mock.method(AgentVoiceConfiguration, "findOne", async () => ({
    ttsProvider: "cartesia",
    ttsModel: "sonic-3.5",
    ttsVoiceId: "voice_123",
    sttProvider: "dograh_default",
    dograhSyncStatus: "configuration_required",
    dograhSyncError: "Dograh voice settings are not verified yet."
  }));

  await assert.rejects(
    () => triggerOutboundCallForAgent({
      agent: fakeAgent({ provider: "vapi", providerAgentId: null }),
      userId: "507f1f77bcf86cd799439012",
      phoneNumber: "+17578297061"
    }),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.statusCode, 400);
      assert.equal(error.details?.code, "DOGRAH_VOICE_NOT_VERIFIED");
      assert.equal(vapiStartCall.mock.callCount(), 0);
      return true;
    }
  );
});

test("non-Dograh agent still enforces E.164 on the phone number", async () => {
  await assert.rejects(
    () => triggerOutboundCallForAgent({
      agent: { _id: "507f1f77bcf86cd799439011", userId: "u1", provider: "vapi", providerAgentId: "asst_1" },
      userId: "u1",
      phoneNumber: "12345"
    }),
    (error) => error instanceof ApiError && error.statusCode === 400
  );
});

test("Vapi agent without a phone-number id auto-imports the Twilio number into Vapi", async () => {
  process.env.VAPI_PRIVATE_KEY = "test_key";

  // Agent has an assistant but no vapiPhoneNumberId -> triggers auto-provision.
  const agent = {
    _id: "507f1f77bcf86cd799439011",
    userId: "507f1f77bcf86cd799439012",
    provider: "vapi",
    providerAgentId: "asst_1",
    telephonyConfigId: "cfg_1",
    callerIdNumber: "+17578297060",
    agentName: "Support",
    businessName: "Acme"
  };

  mock.method(TelephonyConfig, "findById", async () => ({
    provider: "twilio",
    accountSid: "AC123",
    authToken: "plain_token", // decryptSecret returns it unchanged when not enc-prefixed
    phoneNumber: "+17578297060",
    name: "My Twilio"
  }));

  // Fake Vapi REST: GET /phone-number (none imported yet) then POST /phone-number returns the UUID.
  const importedId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const client = {
    async get(url) { return { data: url === "/phone-number" ? [] : {} }; },
    async post(url) { return { data: url === "/phone-number" ? { id: importedId } : { id: "x" } }; }
  };
  mock.method(axios, "create", () => client);

  let persistedId = null;
  mock.method(Agent, "updateOne", async (_filter, update) => { persistedId = update?.$set?.vapiPhoneNumberId; return { acknowledged: true }; });

  const startCall = mock.method(VapiProvider, "startCall", async () => ({ provider: "vapi", providerCallId: "call_1", status: "call_started", raw: {} }));
  mock.method(CallLog, "create", async (doc) => ({ ...doc, _id: "log_1", save: async () => {} }));
  mock.method(FollowUp, "findOne", async () => null);

  await triggerOutboundCallForAgent({ agent, userId: agent.userId, phoneNumber: "+17578297061" });

  assert.equal(agent.vapiPhoneNumberId, importedId, "imported UUID set on agent");
  assert.equal(persistedId, importedId, "imported UUID persisted");
  assert.equal(startCall.mock.callCount(), 1);
});
