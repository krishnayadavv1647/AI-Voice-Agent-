import assert from "node:assert/strict";
import { mock, test } from "node:test";

import axios from "axios";

import Agent from "../src/models/Agent.js";
import CallLog from "../src/models/CallLog.js";
import FollowUp from "../src/models/FollowUp.js";
import TelephonyConfig from "../src/models/TelephonyConfig.js";
import { VapiProvider } from "../src/providers/vapi.provider.js";
import { triggerOutboundCallForAgent } from "../src/services/outboundCall.service.js";
import { ApiError } from "../src/utils/apiError.js";

test("outbound call places via the provider and writes providerCallId + provider on the CallLog", async () => {
  // getProvider("vapi") returns the VapiProvider object by reference, so mocking its method here
  // is what the outbound trigger invokes.
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
    agent: {
      _id: "507f1f77bcf86cd799439011",
      userId: "507f1f77bcf86cd799439012",
      provider: "vapi",
      providerAgentId: "asst_1",
      vapiPhoneNumberId: "11111111-2222-3333-4444-555555555555",
      callerIdNumber: "+17578297060",
      agentName: "Support",
      businessName: "Acme"
    },
    userId: "507f1f77bcf86cd799439012",
    phoneNumber: "+17578297061"
  });

  assert.equal(result.providerResponse.providerCallId, "vapi_call_xyz");
  assert.equal(result.providerResponse.status, "initiated");
  assert.equal(createdDoc.providerCallId, "vapi_call_xyz");
  assert.equal(createdDoc.provider, "vapi");
  assert.equal(createdDoc.source, "vapi");
  assert.equal(createdDoc.callDirection, "outbound");
  assert.equal(createdDoc.status, "initiated");
});

test("outbound call enforces E.164 on the phone number", async () => {
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
    authToken: "plain_token",
    phoneNumber: "+17578297060",
    name: "My Twilio"
  }));

  const importedId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const client = {
    async get(url) { return { data: url === "/phone-number" ? [] : {} }; },
    async post(url) { return { data: url === "/phone-number" ? { id: importedId } : { id: "x" } }; }
  };
  mock.method(axios, "create", () => client);

  let persistedId = null;
  mock.method(Agent, "updateOne", async (_filter, update) => { persistedId = update?.$set?.vapiPhoneNumberId; return { acknowledged: true }; });

  mock.method(VapiProvider, "startCall", async () => ({ provider: "vapi", providerCallId: "call_1", status: "call_started", raw: {} }));
  mock.method(CallLog, "create", async (doc) => ({ ...doc, _id: "log_1", save: async () => {} }));
  mock.method(FollowUp, "findOne", async () => null);

  await triggerOutboundCallForAgent({ agent, userId: agent.userId, phoneNumber: "+17578297061" });

  assert.equal(agent.vapiPhoneNumberId, importedId, "imported UUID set on agent");
  assert.equal(persistedId, importedId, "imported UUID persisted");
});

test("outbound call throws a clear error when the agent has no assistant and none can be created", async () => {
  // provider create returns no id (e.g. misconfig) -> providerAgentId stays empty -> clear error.
  mock.method(VapiProvider, "create", async () => ({ provider: "vapi", status: "created" }));

  await assert.rejects(
    () => triggerOutboundCallForAgent({
      agent: { _id: "507f1f77bcf86cd799439011", userId: "u1", provider: "vapi", vapiPhoneNumberId: "11111111-2222-3333-4444-555555555555" },
      userId: "u1",
      phoneNumber: "+17578297061"
    }),
    (error) => error instanceof ApiError && error.statusCode === 400 && /finished syncing/i.test(error.message)
  );
});
