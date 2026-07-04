import Agent from "../models/Agent.js";
import mongoose from "mongoose";
import { runCustomAgent, runCustomAgentStream } from "../engine/agentRuntime.js";

const FALLBACK_REPLY = "Sorry, I had a little trouble. Could you repeat that?";
const AGENT_CACHE_FOUND_TTL_MS = 15000;
const AGENT_CACHE_MISSING_TTL_MS = 5000;
const TERMINAL_PUNCTUATION = /[.!?]$/;
const PHRASE_PUNCTUATION = /[.!?,;:]$/;
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

function compactChunkText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function appendToBuffer(current, delta) {
  const text = String(delta || "").replace(/\s+/g, " ");
  if (!text.trim()) return current;
  if (!current) return text.trimStart();
  if (/^\s/.test(text) || /\s$/.test(current) || /^[.,!?;:]/.test(text)) {
    return `${current}${text}`.replace(/\s+([.,!?;:])/g, "$1");
  }
  return `${current} ${text}`;
}

function lastWordBoundaryIndex(text, maxChars) {
  const slice = text.slice(0, maxChars + 1);
  const boundary = slice.search(/\s+\S*$/);
  if (boundary > 0) return boundary;
  return text.length <= maxChars ? text.length : maxChars;
}

function hasCompleteWord(text) {
  return /\S+\s+\S*$/.test(text) || PHRASE_PUNCTUATION.test(text.trim());
}

export function createVoiceChunkBuffer({
  onFlush,
  onLog = () => {},
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (timer) => clearTimeout(timer),
  firstFlushChars = 32,
  preferredMinChars = 60,
  preferredMaxChars = 110,
  maxWaitMs = 250,
  firstMaxWaitMs = 300
} = {}) {
  if (typeof onFlush !== "function") throw new Error("createVoiceChunkBuffer requires onFlush.");

  let buffer = "";
  let firstTokenAt = null;
  let lastFlushAt = now();
  let firstFlushAt = null;
  let flushes = 0;
  let timer = null;

  function clearFlushTimer() {
    if (!timer) return;
    clearTimer(timer);
    timer = null;
  }

  function logFlush(text, reason) {
    flushes += 1;
    if (!firstFlushAt) {
      firstFlushAt = now();
      onLog("first_flush", { elapsedMs: firstFlushAt - (firstTokenAt || firstFlushAt) });
    }
    onLog("flush", { chars: text.length, reason });
  }

  function emit(text, reason) {
    const clean = compactChunkText(text);
    if (!clean) return false;
    onFlush(clean);
    lastFlushAt = now();
    logFlush(clean, reason);
    return true;
  }

  function flushSome(reason, { final = false } = {}) {
    clearFlushTimer();
    const cleanBuffer = compactChunkText(buffer);
    if (!cleanBuffer) {
      buffer = "";
      return false;
    }

    if (final) {
      buffer = "";
      return emit(cleanBuffer, reason);
    }

    let flushText = "";
    if (cleanBuffer.length > preferredMaxChars) {
      const boundary = lastWordBoundaryIndex(cleanBuffer, preferredMaxChars);
      flushText = cleanBuffer.slice(0, boundary);
      buffer = cleanBuffer.slice(boundary).trimStart();
    } else {
      flushText = cleanBuffer;
      buffer = "";
    }

    return emit(flushText, reason);
  }

  function shouldFlushForPunctuation(text) {
    const clean = text.trim();
    if (!PHRASE_PUNCTUATION.test(clean)) return false;
    if (TERMINAL_PUNCTUATION.test(clean)) return clean.length >= Math.min(20, firstFlushChars);
    return clean.length >= (firstFlushAt ? preferredMinChars : firstFlushChars);
  }

  function scheduleTimer() {
    clearFlushTimer();
    const wait = firstFlushAt ? maxWaitMs : firstMaxWaitMs;
    timer = setTimer(() => {
      timer = null;
      if (buffer && hasCompleteWord(buffer)) flushSome("timer");
    }, wait);
  }

  return {
    push(delta) {
      const text = String(delta || "");
      if (!text.trim()) return;
      if (!firstTokenAt) firstTokenAt = now();
      buffer = appendToBuffer(buffer, text);
      const clean = compactChunkText(buffer);

      if (shouldFlushForPunctuation(clean)) {
        flushSome("punctuation");
        if (buffer) scheduleTimer();
        return;
      }

      if (clean.length >= preferredMaxChars || (!firstFlushAt && clean.length >= firstFlushChars && hasCompleteWord(clean))) {
        flushSome("length");
        if (buffer) scheduleTimer();
        return;
      }

      scheduleTimer();
    },
    async flushFinal({ logTotal = true } = {}) {
      flushSome("final", { final: true });
      if (logTotal) onLog("total_flushes", { totalFlushes: flushes });
    },
    get flushCount() {
      return flushes;
    }
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
  const smoothBuffer = createVoiceChunkBuffer({
    onFlush: (part) => {
      outputChars += part.length;
      if (!sawFirstToken) {
        sawFirstToken = true;
        const firstTokenElapsed = elapsed(startedAt);
        logLatency("first_token", { conversationId, agentId, provider, model: selectedModel, elapsedMs: firstTokenElapsed, outputChars });
        if (firstTokenElapsed > 4000) console.warn("First token latency is high.");
      }
      res.write(streamChunk({ id, created, model: selectedModel, delta: { content: part }, finishReason: null }));
    },
    onLog: (event, details = {}) => {
      if (event === "first_flush") {
        console.log("[Vapi stream smoothing] first_flush", {
          conversationId,
          agentId,
          elapsedMs: details.elapsedMs
        });
        return;
      }
      if (event === "flush") {
        console.log("[Vapi stream smoothing] flush", {
          conversationId,
          agentId,
          chars: details.chars,
          reason: details.reason
        });
        return;
      }
      if (event === "total_flushes") {
        console.log("[Vapi stream smoothing] total_flushes", {
          conversationId,
          agentId,
          totalFlushes: details.totalFlushes
        });
      }
    }
  });

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
        smoothBuffer.push(part);
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
        smoothBuffer.push(part);
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
        smoothBuffer.push(part);
      }
    }
  }

  await smoothBuffer.flushFinal({ logTotal: false });

  if (!sawFirstToken) {
    for (const part of fallbackStream()) {
      smoothBuffer.push(part);
    }
    await smoothBuffer.flushFinal({ logTotal: false });
  }

  console.log("[Vapi stream smoothing] total_flushes", {
    conversationId,
    agentId,
    totalFlushes: smoothBuffer.flushCount
  });

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
