import Agent from "../models/Agent.js";
import mongoose from "mongoose";
import { runCustomAgent } from "../engine/agentRuntime.js";

const FALLBACK_REPLY = "Sorry, I'm having trouble right now.";

// Split a reply into ~40-80 char pieces on word boundaries so speech starts fast.
export function chunkText(text, { min = 40, max = 80 } = {}) {
  const str = String(text ?? "").trim();
  if (!str) return [];

  const chunks = [];
  let current = "";

  for (const word of str.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length >= max) {
      if (current) {
        chunks.push(current);
        current = word;
      } else {
        // A single very long word: emit it on its own.
        chunks.push(candidate);
        current = "";
      }
    } else if (candidate.length >= min) {
      chunks.push(candidate);
      current = "";
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function streamChunk({ id, created, model, delta, finishReason }) {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }]
  })}\n\n`;
}

export function buildNonStreamCompletion({ id, created, model, reply }) {
  return {
    id,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: reply },
        finish_reason: "stop"
      }
    ]
  };
}

async function defaultLoadAgent(agentId) {
  if (!agentId || !mongoose.Types.ObjectId.isValid(agentId)) return null;
  return Agent.findById(agentId);
}

// POST /api/vapi/chat/completions
// OpenAI-compatible endpoint backed by our engine runtime. Streams SSE by default; never returns
// 500 to Vapi (a 500 makes Vapi drop the call) — it streams a safe fallback sentence instead.
export async function vapiChatCompletions(req, res, deps = {}) {
  const loadAgent = deps.loadAgent || defaultLoadAgent;
  const runAgent = deps.runCustomAgent || runCustomAgent;

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const call = body.call || {};
  const metadata = body.metadata || call.metadata || {};

  const agentId = metadata.localAgentId || body.model || call.assistantId;
  const conversationId = call.id || metadata.conversationId || `web-${Date.now()}`;
  const model = body.model || "custom-workflow";
  const userText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  let reply = FALLBACK_REPLY;
  // Diagnostic only: the reason the engine could not produce a reply. Surfaced in a response header
  // (never in the spoken SSE content) so the failure is visible via curl without hunting logs.
  let engineError = null;
  try {
    const agent = await loadAgent(agentId);
    if (!agent) {
      engineError = `agent not found: ${agentId}`;
      console.error("[Vapi chat] agent not found", { agentId, conversationId });
    } else {
      const result = await runAgent({ agent, userMessage: userText, conversationId });
      reply = result?.reply || FALLBACK_REPLY;
    }
  } catch (error) {
    engineError = error.message;
    console.error("[Vapi chat] runCustomAgent failed:", error.message);
    reply = FALLBACK_REPLY;
  }

  const id = `chatcmpl-${conversationId}`;
  const created = Math.floor(Date.now() / 1000);
  if (engineError) res.setHeader("X-Vapi-Engine-Error", String(engineError).slice(0, 300));

  // Non-streamed mode (Vapi uses streaming; this makes local curl testing trivial).
  if (body.stream === false) {
    return res.status(200).json(buildNonStreamCompletion({ id, created, model, reply }));
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  for (const part of chunkText(reply)) {
    res.write(streamChunk({ id, created, model, delta: { content: part }, finishReason: null }));
  }
  res.write(streamChunk({ id, created, model, delta: {}, finishReason: "stop" }));
  res.write("data: [DONE]\n\n");
  res.end();
}
