import assert from "node:assert/strict";
import { test } from "node:test";

import { chunkText, buildNonStreamCompletion, createVoiceChunkBuffer, vapiChatCompletions } from "../src/controllers/vapiChat.controller.js";

// ---- fake res --------------------------------------------------------------

function fakeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    chunks: [],
    ended: false,
    status(code) { this.statusCode = code; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    flushHeaders() {},
    write(data) { this.chunks.push(data); },
    end() { this.ended = true; },
    json(obj) { this.body = obj; return this; }
  };
}

// ---- chunkText -------------------------------------------------------------

test("chunkText splits into word-boundary pieces and reassembles to the original words", () => {
  const text = "Hello there, this is a reasonably long assistant reply that should be split into several chunks for fast speech.";
  const chunks = chunkText(text);

  assert.ok(chunks.length > 1, "should produce multiple chunks");
  assert.equal(chunks.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
});

test("chunkText returns [] for empty input", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText(null), []);
});

// ---- voice chunk smoothing -------------------------------------------------

function voiceBuffer(flushes, options = {}) {
  return createVoiceChunkBuffer({
    onFlush: (text) => flushes.push(text),
    setTimer: options.setTimer || (() => null),
    clearTimer: () => {},
    now: options.now || (() => 0),
    ...options
  });
}

test("voice chunk buffer combines token fragments into complete phrase chunks", async () => {
  const flushes = [];
  const buffer = voiceBuffer(flushes, { firstFlushChars: 80 });
  for (const delta of ["Yes", ",", " we", " can", " help", " you", " with", " that", ".", " What", " service", " do", " you", " need", "?"]) {
    buffer.push(delta);
  }
  await buffer.flushFinal();

  assert.deepEqual(flushes, [
    "Yes, we can help you with that.",
    "What service do you need?"
  ]);
});

test("voice chunk buffer does not split words in the middle on length flush", () => {
  const flushes = [];
  const buffer = voiceBuffer(flushes, { preferredMaxChars: 70, firstFlushChars: 70 });
  buffer.push("This response contains several complete words that should be flushed only at a word boundary before continuing smoothly");

  assert.ok(flushes.length >= 1);
  assert.match(flushes[0], /\w$/);
  assert.equal(flushes[0].includes("continu"), false);
});

test("voice chunk buffer first flush happens within timer threshold", () => {
  const flushes = [];
  const timers = [];
  let currentTime = 0;
  const buffer = voiceBuffer(flushes, {
    now: () => currentTime,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    firstMaxWaitMs: 120
  });

  buffer.push("We can help");
  assert.equal(timers.at(-1).ms, 120);
  currentTime = 120;
  timers.at(-1).fn();

  assert.deepEqual(flushes, ["We can help"]);
});

test("voice chunk buffer max-gap watchdog flushes buffered complete words", () => {
  const flushes = [];
  const timers = [];
  let currentTime = 0;
  const buffer = voiceBuffer(flushes, {
    now: () => currentTime,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    firstFlushChars: 80,
    firstMaxWaitMs: 300,
    maxWaitMs: 300,
    maxGapMs: 700
  });

  buffer.push("This first phrase is ready.");
  currentTime = 700;
  buffer.push(" Another phrase");

  assert.deepEqual(flushes, ["This first phrase is ready.", "Another phrase"]);
});

test("voice chunk buffer flushes on punctuation once a spoken phrase is ready", () => {
  const flushes = [];
  const buffer = voiceBuffer(flushes, { firstFlushChars: 80 });
  buffer.push("Please hold on while I check");
  buffer.push(".");

  assert.deepEqual(flushes, ["Please hold on while I check."]);
});

test("voice chunk buffer final flush sends remaining text", async () => {
  const flushes = [];
  const buffer = voiceBuffer(flushes);
  buffer.push("Let me check that for you");
  await buffer.flushFinal();

  assert.deepEqual(flushes, ["Let me check that for you"]);
});

test("voice chunk buffer ignores empty chunks", async () => {
  const flushes = [];
  const buffer = voiceBuffer(flushes);
  buffer.push("");
  buffer.push("   ");
  await buffer.flushFinal();

  assert.deepEqual(flushes, []);
});

test("voice chunk buffer can flush quickly without splitting tiny raw tokens", () => {
  const flushes = [];
  const buffer = voiceBuffer(flushes);
  for (const delta of ["we", " can", " help", " you", " today"]) buffer.push(delta);

  assert.deepEqual(flushes, ["we can help you today"]);
});

// ---- streaming path --------------------------------------------------------

test("streaming path writes a content delta and a terminal [DONE]", async () => {
  const res = fakeRes();
  const req = {
    body: {
      stream: true,
      model: "agent_1",
      messages: [{ role: "user", content: "hi" }],
      call: { id: "call_1" }
    }
  };

  await vapiChatCompletions(req, res, {
    loadAgent: async () => ({ _id: "agent_1" }),
    runCustomAgent: async () => ({ reply: "Hello, how can I help you today?" })
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "text/event-stream; charset=utf-8");
  assert.ok(res.chunks.some((c) => c.includes('"content"')), "at least one content delta");
  assert.ok(res.chunks.some((c) => c.includes('"finish_reason":"stop"')), "terminal stop frame");
  assert.ok(res.chunks.some((c) => c.includes("[DONE]")), "[DONE] sentinel");
  assert.ok(res.ended);
});

test("streaming path writes the first chunk before the full runtime stream completes", async () => {
  const res = fakeRes();
  const req = {
    body: {
      stream: true,
      model: "agent_1",
      messages: [{ role: "user", content: "hi" }],
      call: { id: "call_progressive" }
    }
  };

  let firstChunkWasWrittenBeforeSecond = false;
  async function* runCustomAgentStream() {
    yield "First phrase arrives quickly. ";
    firstChunkWasWrittenBeforeSecond = res.chunks.join("").includes("First phrase arrives quickly.");
    await new Promise((resolve) => setTimeout(resolve, 5));
    yield "Second chunk.";
  }

  await vapiChatCompletions(req, res, {
    loadAgent: async () => ({ _id: "agent_1" }),
    runCustomAgentStream
  });

  assert.equal(firstChunkWasWrittenBeforeSecond, true);
  assert.ok(res.chunks.join("").includes("First phrase arrives quickly."));
  assert.ok(res.chunks.join("").includes("Second chunk."));
});

test("latency logs include first_llm_token, first_sse_flush, and breakdown", async () => {
  const res = fakeRes();
  const req = {
    body: { stream: true, model: "agent_1", messages: [{ role: "user", content: "hi" }], call: { id: "latency_1" } }
  };
  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args);
  try {
    async function* runCustomAgentStream() {
      yield "Helpful answer with punctuation.";
    }
    await vapiChatCompletions(req, res, {
      loadAgent: async () => ({ _id: "agent_1" }),
      runCustomAgentStream
    });
  } finally {
    console.log = originalLog;
  }

  const text = logs.map((entry) => String(entry[0])).join("\n");
  assert.match(text, /\[Vapi latency\] first_llm_token/);
  assert.match(text, /\[Vapi latency\] first_sse_flush/);
  assert.match(text, /\[Vapi latency breakdown\]/);
});

test("filler text is not sent when first token is delayed unless explicitly enabled", async () => {
  const res = fakeRes();
  const req = {
    body: { stream: true, model: "agent_1", messages: [{ role: "user", content: "hi" }], call: { id: "no_filler" } }
  };

  async function* runCustomAgentStream() {
    yield "Actual answer.";
  }

  await vapiChatCompletions(req, res, {
    loadAgent: async () => ({ _id: "agent_1", settings: { llm: { enableFirstTokenFiller: false } } }),
    runCustomAgentStream
  });

  assert.equal(res.chunks.join("").includes("One moment, let me check that."), false);
  assert.ok(res.chunks.join("").includes("Actual answer."));
});

test("agent-not-found streams the fallback and still returns 200", async () => {
  const res = fakeRes();
  const req = {
    body: { stream: true, model: "missing", messages: [{ role: "user", content: "hi" }], call: { id: "c2" } }
  };

  let ranAgent = false;
  await vapiChatCompletions(req, res, {
    loadAgent: async () => null,
    runCustomAgent: async () => { ranAgent = true; return { reply: "should not happen" }; }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(ranAgent, false, "runCustomAgent should not run when agent is missing");
  const joined = res.chunks.join("");
  assert.ok(joined.includes("trouble"), "fallback sentence streamed");
  assert.ok(joined.includes("[DONE]"));
});

test("runCustomAgent throwing does not 500 — streams fallback", async () => {
  const res = fakeRes();
  const req = { body: { stream: true, model: "agent_1", messages: [{ role: "user", content: "hi" }], call: { id: "c3" } } };

  await vapiChatCompletions(req, res, {
    loadAgent: async () => ({ _id: "agent_1" }),
    runCustomAgent: async () => { throw new Error("engine boom"); }
  });

  assert.equal(res.statusCode, 200);
  assert.ok(res.chunks.join("").includes("trouble"));
});

// ---- non-streamed path -----------------------------------------------------

test("stream:false returns a single OpenAI-style JSON completion", async () => {
  const res = fakeRes();
  const req = {
    body: { stream: false, model: "agent_1", messages: [{ role: "user", content: "hi" }], call: { id: "c4" } }
  };

  await vapiChatCompletions(req, res, {
    loadAgent: async () => ({ _id: "agent_1" }),
    runCustomAgent: async () => ({ reply: "A single reply." })
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.object, "chat.completion");
  assert.equal(res.body.choices[0].message.content, "A single reply.");
  assert.equal(res.body.choices[0].finish_reason, "stop");
  assert.equal(res.chunks.length, 0, "no SSE writes in non-stream mode");
});

test("buildNonStreamCompletion shape", () => {
  const c = buildNonStreamCompletion({ id: "x", created: 1, model: "m", reply: "hi" });
  assert.equal(c.object, "chat.completion");
  assert.equal(c.choices[0].message.role, "assistant");
  assert.equal(c.choices[0].message.content, "hi");
});
