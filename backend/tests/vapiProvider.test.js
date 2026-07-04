import assert from "node:assert/strict";
import { mock, test, beforeEach, afterEach } from "node:test";

import axios from "axios";

import { buildAssistantConfig, mapVoice } from "../src/services/vapi.service.js";
import { VapiProvider } from "../src/providers/vapi.provider.js";
import { ApiError } from "../src/utils/apiError.js";

// ---- Fakes -----------------------------------------------------------------

function fakeAgent(overrides = {}) {
  return {
    _id: { toString: () => "agent_123" },
    userId: { toString: () => "user_456" },
    agentName: "Support Bot",
    businessName: "Acme Corp",
    sttModel: "",
    sttLanguage: "en",
    ttsProvider: "elevenlabs",
    voiceId: "voice_abc",
    ttsModel: "",
    firstMessage: "Hi there!",
    greetingMessage: "",
    providerAgentId: undefined,
    ...overrides
  };
}

// Returns a fake axios client and a call log so tests can assert on network usage.
function fakeClient(handlers = {}) {
  const calls = [];
  const client = {
    async post(url, body) {
      calls.push({ method: "post", url, body });
      return { data: handlers.post ? handlers.post(url, body) : { id: "asst_default" } };
    },
    async patch(url, body) {
      calls.push({ method: "patch", url, body });
      return { data: handlers.patch ? handlers.patch(url, body) : { id: "asst_default" } };
    },
    async delete(url) {
      calls.push({ method: "delete", url });
      return { data: handlers.delete ? handlers.delete(url) : { deleted: true } };
    }
  };
  return { client, calls };
}

const ENV_KEYS = [
  "VAPI_PRIVATE_KEY",
  "VAPI_CUSTOM_LLM_URL",
  "VAPI_PHONE_NUMBER_ID",
  "VAPI_DEFAULT_VOICE_ID",
  "PUBLIC_BACKEND_URL"
];
let savedEnv = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];

  process.env.VAPI_PRIVATE_KEY = "test_key";
  process.env.VAPI_CUSTOM_LLM_URL = "https://engine.example.com/api/vapi";
  process.env.VAPI_PHONE_NUMBER_ID = "95d51f79-c397-46f9-b49a-23763d3eaa2d";
  process.env.PUBLIC_BACKEND_URL = "https://backend.example.com";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  mock.restoreAll();
});

// ---- buildAssistantConfig (checklist 1) ------------------------------------

test("buildAssistantConfig points the model at the custom-llm URL and routes to the agent id", () => {
  const config = buildAssistantConfig(fakeAgent());

  assert.equal(config.model.provider, "custom-llm");
  assert.equal(config.model.url, "https://engine.example.com/api/vapi");
  assert.equal(config.model.model, "agent_123");
  assert.equal(config.server.url, "https://backend.example.com/api/vapi/webhook");
  assert.equal(config.metadata.localAgentId, "agent_123");
});

// ---- mapVoice fallback (checklist 2) ---------------------------------------

test("mapVoice falls back to the default when ttsProvider is unsupported", () => {
  process.env.VAPI_DEFAULT_VOICE_ID = "burt";
  const voice = mapVoice(fakeAgent({ ttsProvider: "legacy_default", voiceId: "ignored" }));

  assert.equal(voice.provider, "11labs");
  assert.equal(voice.voiceId, "burt");
});

// ---- create() success (checklist 3) ----------------------------------------

test("create() returns provider ids equal to the mocked assistant id", async () => {
  const { client } = fakeClient({ post: () => ({ id: "asst_new" }) });
  mock.method(axios, "create", () => client);

  const result = await VapiProvider.create(fakeAgent());

  assert.equal(result.provider, "vapi");
  assert.equal(result.providerAgentId, "asst_new");
  assert.equal(result.providerWorkflowId, "asst_new");
  assert.equal(result.status, "created");
});

// ---- create() short-circuit (checklist 4) ----------------------------------

test("create() short-circuits without a network call when providerAgentId is set", async () => {
  const { client, calls } = fakeClient();
  mock.method(axios, "create", () => client);

  const result = await VapiProvider.create(fakeAgent({ providerAgentId: "asst_existing" }));

  assert.equal(result.status, "already_exists");
  assert.equal(result.providerAgentId, "asst_existing");
  assert.equal(result.providerWorkflowId, "asst_existing");
  assert.equal(calls.length, 0, "no network call should be made");
});

// ---- startCall() (checklist 5) ---------------------------------------------

test("startCall() throws ApiError(400) on a non-E.164 number", async () => {
  await assert.rejects(
    () => VapiProvider.startCall(fakeAgent({ providerAgentId: "asst_1" }), { phoneNumber: "12345" }),
    (err) => err instanceof ApiError && err.statusCode === 400
  );
});

test("startCall() returns a providerCallId on success (env phone-number UUID fallback)", async () => {
  const { client } = fakeClient({ post: () => ({ id: "call_789" }) });
  mock.method(axios, "create", () => client);

  const result = await VapiProvider.startCall(
    fakeAgent({ providerAgentId: "asst_1" }),
    { phoneNumber: "+17578297060" }
  );

  assert.equal(result.provider, "vapi");
  assert.equal(result.providerCallId, "call_789");
  assert.equal(result.status, "call_started");
});

test("startCall() uses the per-agent vapiPhoneNumberId over the env fallback", async () => {
  const agentPhoneId = "11111111-2222-3333-4444-555555555555";
  const { client, calls } = fakeClient({ post: () => ({ id: "call_abc" }) });
  mock.method(axios, "create", () => client);

  await VapiProvider.startCall(
    fakeAgent({ providerAgentId: "asst_1", vapiPhoneNumberId: agentPhoneId }),
    { phoneNumber: "+17578297060" }
  );

  const callPost = calls.find((c) => c.url === "/call");
  assert.equal(callPost.body.phoneNumberId, agentPhoneId);
});

test("startCall() throws ApiError(400) when the phone-number id is not a UUID (e.g. a phone number)", async () => {
  await assert.rejects(
    () => VapiProvider.startCall(
      fakeAgent({ providerAgentId: "asst_1", vapiPhoneNumberId: "+17578297060" }),
      { phoneNumber: "+17578297060" }
    ),
    (err) => err instanceof ApiError && err.statusCode === 400 && /UUID/i.test(err.message)
  );
});

test("startCall() throws ApiError(400) when no phone-number id is configured anywhere", async () => {
  delete process.env.VAPI_PHONE_NUMBER_ID;
  await assert.rejects(
    () => VapiProvider.startCall(fakeAgent({ providerAgentId: "asst_1" }), { phoneNumber: "+17578297060" }),
    (err) => err instanceof ApiError && err.statusCode === 400
  );
});
