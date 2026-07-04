import assert from "node:assert/strict";
import { test } from "node:test";

import { chunkText, buildNonStreamCompletion, vapiChatCompletions } from "../src/controllers/vapiChat.controller.js";

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
    yield "First chunk. ";
    firstChunkWasWrittenBeforeSecond = res.chunks.join("").includes("First chunk.");
    await new Promise((resolve) => setTimeout(resolve, 5));
    yield "Second chunk.";
  }

  await vapiChatCompletions(req, res, {
    loadAgent: async () => ({ _id: "agent_1" }),
    runCustomAgentStream
  });

  assert.equal(firstChunkWasWrittenBeforeSecond, true);
  assert.ok(res.chunks.join("").includes("First chunk."));
  assert.ok(res.chunks.join("").includes("Second chunk."));
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
