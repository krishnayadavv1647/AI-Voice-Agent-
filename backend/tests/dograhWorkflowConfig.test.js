import assert from "node:assert/strict";
import { mock, test } from "node:test";

import AgentLLMConfiguration from "../src/models/AgentLLMConfiguration.js";
import AgentVoiceConfiguration from "../src/models/AgentVoiceConfiguration.js";
import { extractEffectiveRuntime, verifyDograhWorkflowRuntime } from "../src/services/dograhWorkflowConfig.service.js";

test("extractEffectiveRuntime reads nested Dograh speech config aliases", () => {
  const runtime = extractEffectiveRuntime({
    workflow_configurations: {
      model_configuration_v2_override: {
        audio: {
          output: {
            type: "tts",
            config: {
              provider_name: "cartesia",
              model_name: "sonic-3.5",
              voice_id: "voice_123"
            }
          }
        },
        input: {
          speech_to_text: {
            providerId: "deepgram",
            modelId: "nova-3-general"
          }
        }
      }
    }
  });

  assert.equal(runtime.tts.provider, "cartesia");
  assert.equal(runtime.tts.model, "sonic-3.5");
  assert.equal(runtime.tts.voiceId, "voice_123");
  assert.equal(runtime.stt.provider, "deepgram");
  assert.equal(runtime.stt.model, "nova-3-general");
});

test("verifyDograhWorkflowRuntime can use previously synced voice runtime when Dograh read-back omits voice blocks", async () => {
  mock.method(AgentLLMConfiguration, "findOne", async () => ({
    provider: "dograh_default",
    model: ""
  }));
  mock.method(AgentVoiceConfiguration, "findOne", async () => ({
    ttsProvider: "cartesia",
    ttsModel: "sonic-3.5",
    ttsVoiceId: "voice_123",
    sttProvider: "deepgram",
    sttModel: "nova-3-general",
    dograhSyncStatus: "synced",
    dograhEffectiveTtsProvider: "cartesia",
    dograhEffectiveTtsModel: "sonic-3.5",
    dograhEffectiveTtsVoiceId: "voice_123",
    dograhEffectiveSttProvider: "deepgram",
    dograhEffectiveSttModel: "nova-3-general"
  }));

  const verification = await verifyDograhWorkflowRuntime({
    agent: { _id: "agent_1", dograhWorkflowId: "workflow_1", dograhWorkflowUuid: "uuid_1" },
    userId: "user_1",
    workflowPayload: {
      workflow_uuid: "uuid_1",
      workflow_definition: {
        nodes: [{ type: "startCall", data: { prompt: "Hello" } }]
      },
      workflow_configurations: {}
    }
  });

  assert.equal(verification.ok, true);
  assert.equal(verification.effective.tts.provider, "cartesia");
  assert.equal(verification.effective.stt.provider, "deepgram");
});
