import assert from "node:assert/strict";
import { test, afterEach } from "node:test";

import { streamGeminiResponse } from "../src/llm/gemini.llm.js";

// ---- fake Gemini streams ---------------------------------------------------

function chunkStream(texts) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next: async () => (i < texts.length
          ? { value: { text: texts[i++] }, done: false }
          : { value: undefined, done: true })
      };
    }
  };
}

function stallStream() {
  return { [Symbol.asyncIterator]() { return { next: () => new Promise(() => {}) }; } };
}

function chunkThenError(text, error) {
  return {
    [Symbol.asyncIterator]() {
      let n = 0;
      return {
        next: async () => {
          n += 1;
          if (n === 1) return { value: { text }, done: false };
          throw error;
        }
      };
    }
  };
}

// Fake GoogleGenAI client. `handler(model)` returns a stream or throws.
function fakeAi(handler) {
  const calls = [];
  return {
    calls,
    models: {
      generateContentStream: async (args) => {
        calls.push(args.model);
        return handler(args.model);
      }
    }
  };
}

async function collect(gen) {
  const out = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

function runStream({ ai, settings }) {
  return streamGeminiResponse({
    apiKey: "test-key",
    model: "m1",
    messages: [{ role: "user", content: "hello" }],
    settings,
    client: ai
  });
}

const savedFallbackEnv = process.env.GEMINI_VOICE_FALLBACK_MODELS;
afterEach(() => {
  if (savedFallbackEnv === undefined) delete process.env.GEMINI_VOICE_FALLBACK_MODELS;
  else process.env.GEMINI_VOICE_FALLBACK_MODELS = savedFallbackEnv;
});

// ---- (a) 503 → next model --------------------------------------------------

test("voice mode falls back to the next model on a 503 and logs the switch", async () => {
  process.env.GEMINI_VOICE_FALLBACK_MODELS = "m2";
  const err503 = Object.assign(new Error("Service Unavailable"), { status: 503 });
  const ai = fakeAi((model) => {
    if (model === "m1") throw err503;
    return chunkStream(["hi", " there"]);
  });

  const warns = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warns.push(args);

  let chunks;
  try {
    chunks = await collect(runStream({ ai, settings: { voiceMode: true, firstTokenTimeoutMs: 50 } }));
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(chunks, ["hi", " there"]);
  assert.deepEqual(ai.calls, ["m1", "m2"]);
  const warned = warns.map((w) => JSON.stringify(w)).join("\n");
  assert.match(warned, /\[Gemini fallback\] switching model/);
  assert.match(warned, /"from":"m1"/);
  assert.match(warned, /"to":"m2"/);
});

// ---- (b) first-token stall → next model ------------------------------------

test("voice mode falls back when the first model stalls past the timeout", async () => {
  process.env.GEMINI_VOICE_FALLBACK_MODELS = "m2";
  const ai = fakeAi((model) => (model === "m1" ? stallStream() : chunkStream(["ok"])));

  const chunks = await collect(runStream({ ai, settings: { voiceMode: true, firstTokenTimeoutMs: 30 } }));

  assert.deepEqual(chunks, ["ok"]);
  assert.deepEqual(ai.calls, ["m1", "m2"]);
});

// ---- (c) commit then mid-stream error → NO fallback ------------------------

test("voice mode does not fall back once a chunk has already been yielded", async () => {
  process.env.GEMINI_VOICE_FALLBACK_MODELS = "m2";
  const midError = Object.assign(new Error("boom mid stream"), { status: 503 });
  const ai = fakeAi((model) => (model === "m1"
    ? chunkThenError("partial", midError)
    : chunkStream(["should-not-run"])));

  const chunks = [];
  await assert.rejects(async () => {
    for await (const chunk of runStream({ ai, settings: { voiceMode: true, firstTokenTimeoutMs: 100 } })) {
      chunks.push(chunk);
    }
  });

  assert.deepEqual(chunks, ["partial"]);
  assert.deepEqual(ai.calls, ["m1"], "must not switch models after committing to one");
});

// ---- (d) non-voice → single model, no chain --------------------------------

test("non-voice mode uses only the selected model (no fallback chain)", async () => {
  process.env.GEMINI_VOICE_FALLBACK_MODELS = "m2";
  const ai = fakeAi((model) => (model === "m1" ? chunkStream(["one"]) : chunkStream(["nope"])));

  const chunks = await collect(runStream({ ai, settings: { voiceMode: false } }));

  assert.deepEqual(chunks, ["one"]);
  assert.deepEqual(ai.calls, ["m1"]);
});
