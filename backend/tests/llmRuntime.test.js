import assert from "node:assert/strict";
import { test } from "node:test";

import { clampVoiceMaxTokens, resolveAgentLLMRuntimeConfig } from "../src/engine/agentRuntime.js";

function withEnv(patch, fn) {
  const previous = {};
  for (const key of Object.keys(patch)) {
    previous[key] = process.env[key];
    if (patch[key] === undefined) delete process.env[key];
    else process.env[key] = patch[key];
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test("Gemini model defaults to gemini-2.5-flash", async () => {
  await withEnv({ GEMINI_MODEL: undefined }, async () => {
    const config = await resolveAgentLLMRuntimeConfig({ agent: { settings: {} }, skipDb: true });
    assert.equal(config.model, "gemini-2.5-flash");
  });
});

test("env GEMINI_MODEL is respected when no agent model is selected", async () => {
  await withEnv({ GEMINI_MODEL: "gemini-env-model" }, async () => {
    const config = await resolveAgentLLMRuntimeConfig({ agent: { settings: {} }, skipDb: true });
    assert.equal(config.model, "gemini-env-model");
  });
});

test("agent selected UI model overrides env model", async () => {
  await withEnv({ GEMINI_MODEL: "gemini-env-model" }, async () => {
    const config = await resolveAgentLLMRuntimeConfig({
      agent: { settings: { llm: { model: "gemini-ui-model" } } },
      skipDb: true
    });
    assert.equal(config.model, "gemini-ui-model");
  });
});

test("connected account API key overrides env GEMINI_API_KEY", async () => {
  await withEnv({ GEMINI_API_KEY: "env-secret-key" }, async () => {
    const config = await resolveAgentLLMRuntimeConfig({
      agent: { settings: {} },
      connectedApiKeyOverride: "ui-secret-key",
      skipDb: true
    });
    assert.equal(config.apiKey, "ui-secret-key");
  });
});

test("env fallback API key is used when connected account is missing", async () => {
  await withEnv({ GEMINI_API_KEY: "env-secret-key" }, async () => {
    const config = await resolveAgentLLMRuntimeConfig({
      agent: { settings: {} },
      connectedApiKeyOverride: null,
      skipDb: true
    });
    assert.equal(config.apiKey, "env-secret-key");
  });
});

test("voice max tokens are clamped between 32 and 160", () => {
  assert.equal(clampVoiceMaxTokens(1), 32);
  assert.equal(clampVoiceMaxTokens(96), 96);
  assert.equal(clampVoiceMaxTokens(1000), 160);
});

test("temperature defaults to 0.3", async () => {
  await withEnv({ GEMINI_TEMPERATURE: undefined }, async () => {
    const config = await resolveAgentLLMRuntimeConfig({ agent: { settings: {} }, skipDb: true });
    assert.equal(config.settings.temperature, 0.3);
  });
});

test("resolver logs do not include API keys", async () => {
  await withEnv({ GEMINI_API_KEY: "env-secret-key" }, async () => {
    const originalLog = console.log;
    const entries = [];
    console.log = (...args) => entries.push(args);
    try {
      await resolveAgentLLMRuntimeConfig({
        agent: { _id: "agent_1", settings: {} },
        connectedApiKeyOverride: "ui-secret-key",
        skipDb: true
      });
    } finally {
      console.log = originalLog;
    }

    const output = JSON.stringify(entries);
    assert.equal(output.includes("ui-secret-key"), false);
    assert.equal(output.includes("env-secret-key"), false);
  });
});
