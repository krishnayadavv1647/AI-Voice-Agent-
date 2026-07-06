
import assert from "node:assert/strict";
import { test } from "node:test";

import { geminiClient, streamWithFirstTokenWatchdog } from "../src/llm/gemini.llm.js";

// ---- client cache reuse (checklist 4a) -------------------------------------

test("geminiClient returns the same instance for the same apiKey+timeoutMs key", () => {
  const a = geminiClient("test-key-cache-1", {});
  const b = geminiClient("test-key-cache-1", {});
  assert.equal(a, b);
});

test("geminiClient returns different instances for different timeoutMs on the same key", () => {
  const a = geminiClient("test-key-cache-2", {});
  const b = geminiClient("test-key-cache-2", { timeoutMs: 5000 });
  assert.notEqual(a, b);
});

// ---- first-token watchdog retry (checklist 4c) -----------------------------

function stallingStream() {
  return {
    [Symbol.asyncIterator]() {
      return { next: () => new Promise(() => {}) }; // never resolves
    }
  };
}

function immediateStream(values) {
  let i = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          if (i < values.length) return { value: values[i++], done: false };
          return { value: undefined, done: true };
        }
      };
    }
  };
}

test("streamWithFirstTokenWatchdog retries once when the first stream stalls on its first chunk", async () => {
  let call = 0;
  const originalWarn = console.warn;
  const warnCalls = [];
  console.warn = (...args) => warnCalls.push(args);

  async function createStream() {
    call += 1;
    return call === 1 ? stallingStream() : immediateStream(["hello", "world"]);
  }

  try {
    const chunks = [];
    for await (const chunk of streamWithFirstTokenWatchdog(createStream, { timeoutMs: 30, model: "test-model" })) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, ["hello", "world"]);
    assert.equal(call, 2, "should have retried exactly once");
    assert.equal(warnCalls.length, 1);
    assert.match(warnCalls[0][0], /first-token timeout, retrying once/);
    assert.equal(warnCalls[0][1].model, "test-model");
  } finally {
    console.warn = originalWarn;
  }
});

test("streamWithFirstTokenWatchdog does not retry when the first chunk arrives before the timeout", async () => {
  let call = 0;
  async function createStream() {
    call += 1;
    return immediateStream(["quick"]);
  }

  const chunks = [];
  for await (const chunk of streamWithFirstTokenWatchdog(createStream, { timeoutMs: 200 })) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ["quick"]);
  assert.equal(call, 1);
});
