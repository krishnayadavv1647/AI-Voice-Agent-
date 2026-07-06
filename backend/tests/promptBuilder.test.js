import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAgentMessages } from "../src/engine/promptBuilder.js";

test("buildAgentMessages truncates an oversized system prompt for voice calls at a word boundary", () => {
  const longPrompt = "word ".repeat(2000); // 10000 chars
  const agent = { _id: "agent_trunc_1", agentName: "Test", systemPrompt: longPrompt };

  const originalWarn = console.warn;
  const warnCalls = [];
  console.warn = (...args) => warnCalls.push(args);

  try {
    const messages = buildAgentMessages({ agent, userMessage: "hi", voiceMode: true });
    const systemContent = messages[0].content;

    assert.ok(systemContent.includes("[Instructions truncated for live call latency.]"));
    const truncatedPart = systemContent.split("\n[Instructions truncated")[0];
    assert.ok(truncatedPart.length <= 6000, "truncated part must not exceed the 6000 char cap");
    assert.notEqual(truncatedPart.slice(-1), " ", "must not cut mid-word, leaving a trailing space");
    assert.equal(longPrompt.startsWith(truncatedPart), true, "truncated text must be a prefix of the original");

    // A second call for the same agent id must not warn again.
    buildAgentMessages({ agent, userMessage: "hi again", voiceMode: true });
    assert.equal(warnCalls.length, 1);
    assert.equal(warnCalls[0][0], "[promptBuilder] system prompt truncated for voice");
    assert.equal(warnCalls[0][1].agentId, "agent_trunc_1");
    assert.equal(warnCalls[0][1].originalChars, longPrompt.length);
  } finally {
    console.warn = originalWarn;
  }
});

test("buildAgentMessages does not truncate the system prompt for non-voice calls", () => {
  const longPrompt = "word ".repeat(2000);
  const agent = { _id: "agent_trunc_2", systemPrompt: longPrompt };

  const messages = buildAgentMessages({ agent, userMessage: "hi", voiceMode: false });
  assert.ok(messages[0].content.startsWith(longPrompt));
  assert.equal(messages[0].content.includes("truncated"), false);
});

test("buildAgentMessages leaves a short voice system prompt untouched", () => {
  const agent = { _id: "agent_trunc_3", systemPrompt: "Short prompt." };

  const messages = buildAgentMessages({ agent, userMessage: "hi", voiceMode: true });
  assert.ok(messages[0].content.includes("Short prompt."));
  assert.equal(messages[0].content.includes("truncated"), false);
});
