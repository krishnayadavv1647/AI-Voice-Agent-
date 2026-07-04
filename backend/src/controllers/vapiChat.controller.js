import Agent from "../models/Agent.js";
import mongoose from "mongoose";
import { runCustomAgent, runCustomAgentStream } from "../engine/agentRuntime.js";

const FALLBACK_REPLY = "Sorry, I had a little trouble. Could you repeat that?";
const AGENT_CACHE_FOUND_TTL_MS = 15000;
const AGENT_CACHE_MISSING_TTL_MS = 5000;
const agentCache = new Map();

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
  const key = String(agentId);
  const cached = agentCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.agent;

  const agent = await Agent.findById(agentId);
  agentCache.set(key, {
    agent,
    expiresAt: Date.now() + (agent ? AGENT_CACHE_FOUND_TTL_MS : AGENT_CACHE_MISSING_TTL_MS)
  });
  return agent;
}

function elapsed(startedAt) {
  return Date.now() - startedAt;
}

function logLatency(event, details = {}) {
  console.log(`[Vapi latency] ${event}`, details);
}

function modelFromAgent(agent, fallbackModel) {
  return agent?.settings?.llm?.manualModelId
    || agent?.settings?.llm?.model
    || agent?.llmModel
    || process.env.GEMINI_MODEL
    || fallbackModel;
}

function providerFromAgent(agent) {
  const provider = agent?.settings?.llm?.provider || agent?.llmProvider || process.env.DEFAULT_LLM_PROVIDER || "google_gemini";
  return provider === "platform_default" ? "google_gemini" : provider;
}

function fallbackStream() {
  return chunkText(FALLBACK_REPLY, { min: 1, max: 80 });
}

async function* runAgentAsStream(runAgent, args) {
  const result = await runAgent(args);
  for (const chunk of chunkText(result?.reply || FALLBACK_REPLY)) {
    yield chunk;
  }
}

// POST /api/vapi/chat/completions
// OpenAI-compatible endpoint backed by our engine runtime. Streams SSE by default; never returns
// 500 to Vapi (a 500 makes Vapi drop the call) — it streams a safe fallback sentence instead.
export async function vapiChatCompletions(req, res, deps = {}) {
  const loadAgent = deps.loadAgent || defaultLoadAgent;
  const runAgent = deps.runCustomAgent || runCustomAgent;
  const streamAgent = deps.runCustomAgentStream || (deps.runCustomAgent ? (args) => runAgentAsStream(runAgent, args) : runCustomAgentStream);

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const call = body.call || {};
  const metadata = body.metadata || call.metadata || {};

  const agentId = metadata.localAgentId || body.model || call.assistantId;
  const conversationId = call.id || metadata.conversationId || `web-${Date.now()}`;
  const model = body.model || "custom-workflow";
  const userText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const startedAt = Date.now();
  const id = `chatcmpl-${conversationId}`;
  const created = Math.floor(startedAt / 1000);

  logLatency("request_received", {
    conversationId,
    agentId,
    provider: "",
    model,
    elapsedMs: elapsed(startedAt)
  });

  // Non-streamed mode (Vapi uses streaming; this makes local curl testing trivial).
  if (body.stream === false) {
    let reply = FALLBACK_REPLY;
    let engineError = null;
    try {
      const agent = await loadAgent(agentId);
      logLatency("agent_loaded", {
        conversationId,
        agentId,
        provider: providerFromAgent(agent),
        model: modelFromAgent(agent, model),
        elapsedMs: elapsed(startedAt)
      });
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

    if (engineError) res.setHeader("X-Vapi-Engine-Error", String(engineError).slice(0, 300));
    return res.status(200).json(buildNonStreamCompletion({ id, created, model, reply }));
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let outputChars = 0;
  let sawFirstToken = false;
  let agent = null;
  let provider = "";
  let selectedModel = model;

  try {
    agent = await loadAgent(agentId);
    provider = providerFromAgent(agent);
    selectedModel = modelFromAgent(agent, model);
    logLatency("agent_loaded", {
      conversationId,
      agentId,
      provider,
      model: selectedModel,
      elapsedMs: elapsed(startedAt)
    });

    if (!agent) {
      console.error("[Vapi chat] agent not found", { agentId, conversationId });
      for (const part of fallbackStream()) {
        outputChars += part.length;
        if (!sawFirstToken) {
          sawFirstToken = true;
          logLatency("first_token", { conversationId, agentId, provider, model: selectedModel, elapsedMs: elapsed(startedAt), outputChars });
        }
        res.write(streamChunk({ id, created, model: selectedModel, delta: { content: part }, finishReason: null }));
      }
    } else {
      logLatency("llm_started", {
        conversationId,
        agentId,
        provider,
        model: selectedModel,
        elapsedMs: elapsed(startedAt)
      });

      for await (const part of streamAgent({ agent, userMessage: userText, conversationId, voiceMode: true })) {
        if (!part) continue;
        outputChars += part.length;
        if (!sawFirstToken) {
          sawFirstToken = true;
          const firstTokenElapsed = elapsed(startedAt);
          logLatency("first_token", { conversationId, agentId, provider, model: selectedModel, elapsedMs: firstTokenElapsed, outputChars });
          if (firstTokenElapsed > 4000) console.warn("First token latency is high.");
        }
        res.write(streamChunk({ id, created, model: selectedModel, delta: { content: part }, finishReason: null }));
      }
    }
  } catch (error) {
    logLatency("stream_failed", {
      conversationId,
      agentId,
      provider,
      model: selectedModel,
      elapsedMs: elapsed(startedAt),
      outputChars
    });
    console.error("[Vapi chat] stream failed:", error.message);

    if (!sawFirstToken) {
      for (const part of fallbackStream()) {
        outputChars += part.length;
        if (!sawFirstToken) {
          sawFirstToken = true;
          logLatency("first_token", { conversationId, agentId, provider, model: selectedModel, elapsedMs: elapsed(startedAt), outputChars });
        }
        res.write(streamChunk({ id, created, model: selectedModel, delta: { content: part }, finishReason: null }));
      }
    }
  }

  if (!sawFirstToken) {
    for (const part of fallbackStream()) {
      outputChars += part.length;
      if (!sawFirstToken) {
        sawFirstToken = true;
        logLatency("first_token", { conversationId, agentId, provider, model: selectedModel, elapsedMs: elapsed(startedAt), outputChars });
      }
      res.write(streamChunk({ id, created, model: selectedModel, delta: { content: part }, finishReason: null }));
    }
  }

  res.write(streamChunk({ id, created, model: selectedModel, delta: {}, finishReason: "stop" }));
  res.write("data: [DONE]\n\n");
  res.end();
  logLatency("stream_done", {
    conversationId,
    agentId,
    provider,
    model: selectedModel,
    elapsedMs: elapsed(startedAt),
    outputChars
  });
}
