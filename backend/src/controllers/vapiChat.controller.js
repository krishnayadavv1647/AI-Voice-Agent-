import Agent from "../models/Agent.js";
import mongoose from "mongoose";
import { runCustomAgent, runCustomAgentStream } from "../engine/agentRuntime.js";
import { createTransferGate, writeTransferToolCallSSE } from "../engine/transferSignal.js";
import { transferNumberForAgent } from "../utils/phone.js";

const FALLBACK_REPLY = "Sorry, I had a little trouble. Could you repeat that?";
const AGENT_CACHE_FOUND_TTL_MS = 15000;
const AGENT_CACHE_MISSING_TTL_MS = 5000;
const TERMINAL_PUNCTUATION = /[.!?]$/;
const PHRASE_PUNCTUATION = /[.!?,;:]$/;
const agentCache = new Map();
const AGENT_CACHE_MAX = 500;

// Expired entries are ignored on read but never deleted, so sweep periodically to bound memory on
// a small instance. Unref'd so it never keeps the process alive during shutdown.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of agentCache) {
    if (entry.expiresAt <= now) agentCache.delete(key);
  }
}, 60 * 1000).unref();

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
  firstFlushChars = 20,
  preferredMinChars = 35,
  preferredMaxChars = 70,
  maxWaitMs = 150,
  firstMaxWaitMs = 120,
  maxGapMs = 700,
  noDeltaLogMs = 700
} = {}) {
  if (typeof onFlush !== "function") throw new Error("createVoiceChunkBuffer requires onFlush.");

  let buffer = "";
  let firstTokenAt = null;
  let lastFlushAt = now();
  let firstFlushAt = null;
  let flushes = 0;
  let timer = null;
  let noDeltaTimer = null;
  let maxGapBetweenFlushes = 0;

  function clearFlushTimer() {
    if (!timer) return;
    clearTimer(timer);
    timer = null;
  }

  function clearNoDeltaTimer() {
    if (!noDeltaTimer) return;
    clearTimer(noDeltaTimer);
    noDeltaTimer = null;
  }

  function scheduleNoDeltaWatchdog() {
    clearNoDeltaTimer();
    noDeltaTimer = setTimer(() => {
      noDeltaTimer = null;
      if (!buffer) onLog("no_llm_delta", { elapsedMs: noDeltaLogMs });
    }, noDeltaLogMs);
  }

  function logFlush(text, reason) {
    flushes += 1;
    if (!firstFlushAt) {
      firstFlushAt = now();
      onLog("first_flush", { elapsedMs: firstFlushAt - (firstTokenAt || firstFlushAt) });
    }
    onLog("max_gap_between_flushes", { maxGapBetweenFlushes });
    onLog("flush", { chars: text.length, reason });
  }

  function emit(text, reason) {
    const clean = compactChunkText(text);
    if (!clean) return false;
    const emittedAt = now();
    const gap = flushes > 0 ? emittedAt - lastFlushAt : 0;
    maxGapBetweenFlushes = Math.max(maxGapBetweenFlushes, gap);
    onFlush(clean);
    lastFlushAt = emittedAt;
    logFlush(clean, reason);
    scheduleNoDeltaWatchdog();
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
    if (TERMINAL_PUNCTUATION.test(clean)) return clean.length >= Math.min(10, firstFlushChars);
    return clean.length >= (firstFlushAt ? preferredMinChars : Math.min(10, firstFlushChars));
  }

  function scheduleTimer() {
    clearFlushTimer();
    const timeUntilMaxGap = Math.max(0, maxGapMs - (now() - lastFlushAt));
    const wait = firstFlushAt ? maxWaitMs : firstMaxWaitMs;
    const reason = timeUntilMaxGap <= wait ? "max_gap" : "timer";
    timer = setTimer(() => {
      timer = null;
      if (buffer && hasCompleteWord(buffer)) flushSome(reason);
    }, Math.min(wait, timeUntilMaxGap));
  }

  return {
    push(delta) {
      const text = String(delta || "");
      if (!text.trim()) return;
      clearNoDeltaTimer();
      if (!firstTokenAt) firstTokenAt = now();
      buffer = appendToBuffer(buffer, text);
      const clean = compactChunkText(buffer);

      if (now() - lastFlushAt >= maxGapMs && hasCompleteWord(clean)) {
        flushSome("max_gap");
        if (buffer) scheduleTimer();
        return;
      }

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
      clearNoDeltaTimer();
      flushSome("final", { final: true });
      if (logTotal) onLog("total_flushes", { totalFlushes: flushes, maxGapBetweenFlushes });
    },
    get flushCount() {
      return flushes;
    },
    get maxGapBetweenFlushes() {
      return maxGapBetweenFlushes;
    },
    get hasBufferedContent() {
      return Boolean(compactChunkText(buffer));
    }
  };
}

async function defaultLoadAgent(agentId) {
  if (!agentId || !mongoose.Types.ObjectId.isValid(agentId)) return null;
  const key = String(agentId);
  const cached = agentCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.agent;

  const agent = await Agent.findById(agentId);
  if (agentCache.size >= AGENT_CACHE_MAX) {
    agentCache.delete(agentCache.keys().next().value);
  }
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
  const latencyMarks = {
    requestReceived: startedAt,
    agentLoaded: null,
    llmStarted: null,
    firstLlmToken: null,
    firstSseFlush: null,
    streamDone: null
  };

  logLatency("request_received", {
    conversationId,
    agentId,
    provider: "",
    model,
    elapsedMs: elapsed(startedAt)
  });

  // TEMPORARY diagnostic spike (Part B0): does Vapi forward the assistant tool schema to the custom
  // LLM? If body.tools is a non-empty array, native tool calling (B1) is possible; if null/absent,
  // the sentinel bridge (B2, active below) is the only path. Remove after capturing on a live call.
  console.log("[TOOLS DEBUG] incoming body.tools =", JSON.stringify(body.tools ?? null));
  console.log("[TOOLS DEBUG] incoming body keys =", Object.keys(body));

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
  let sawFirstSseFlush = false;
  let sawFirstLlmToken = false;
  let agent = null;
  let provider = "";
  let selectedModel = model;
  let lastSseFlushAt = null;
  let maxGapBetweenSseChunks = 0;
  let firstTokenWarningTimer = null;
  // Human warm-transfer: active only when the agent has a valid forwarding number. The gate holds
  // ALL text until it knows the turn isn't a transfer, so a transfer turn emits zero content deltas
  // (required — Vapi discards a tool_calls chunk that arrives after any content on the same turn).
  let transferGate = null;
  let transferRequested = false;
  let enableFirstTokenFiller = body.enableFirstTokenFiller === true || metadata.enableFirstTokenFiller === true;

  function clearFirstTokenWarningTimer() {
    if (!firstTokenWarningTimer) return;
    clearTimeout(firstTokenWarningTimer);
    firstTokenWarningTimer = null;
  }

  function scheduleFirstTokenWarning() {
    clearFirstTokenWarningTimer();
    firstTokenWarningTimer = setTimeout(() => {
      if (sawFirstLlmToken) return;
      const elapsedMs = elapsed(latencyMarks.llmStarted || startedAt);
      console.warn("[Vapi warning] first_llm_token_delayed", {
        conversationId,
        agentId,
        provider,
        model: selectedModel,
        elapsedMs
      });
      if (enableFirstTokenFiller && !sawFirstSseFlush) {
        smoothBuffer.push("One moment, let me check that.");
      }
    }, 2500);
  }

  function logLatencyBreakdown() {
    const doneAt = latencyMarks.streamDone || Date.now();
    console.log("[Vapi latency breakdown]", {
      conversationId,
      agentId,
      provider,
      model: selectedModel,
      request_to_agent_loaded: latencyMarks.agentLoaded ? latencyMarks.agentLoaded - latencyMarks.requestReceived : null,
      agent_loaded_to_llm_start: latencyMarks.agentLoaded && latencyMarks.llmStarted ? latencyMarks.llmStarted - latencyMarks.agentLoaded : null,
      llm_start_to_first_token: latencyMarks.llmStarted && latencyMarks.firstLlmToken ? latencyMarks.firstLlmToken - latencyMarks.llmStarted : null,
      first_token_to_first_flush: latencyMarks.firstLlmToken && latencyMarks.firstSseFlush ? latencyMarks.firstSseFlush - latencyMarks.firstLlmToken : null,
      first_flush_to_stream_done: latencyMarks.firstSseFlush ? doneAt - latencyMarks.firstSseFlush : null,
      total_backend_time: doneAt - latencyMarks.requestReceived,
      max_gap_between_sse_chunks: maxGapBetweenSseChunks
    });
  }

  const smoothBuffer = createVoiceChunkBuffer({
    onFlush: (part) => {
      const flushedAt = Date.now();
      outputChars += part.length;
      if (lastSseFlushAt) {
        maxGapBetweenSseChunks = Math.max(maxGapBetweenSseChunks, flushedAt - lastSseFlushAt);
      }
      lastSseFlushAt = flushedAt;
      if (!sawFirstSseFlush) {
        sawFirstSseFlush = true;
        latencyMarks.firstSseFlush = flushedAt;
        logLatency("first_sse_flush", {
          conversationId,
          agentId,
          provider,
          model: selectedModel,
          elapsedMs: elapsed(startedAt),
          outputChars
        });
      }
      logLatency("tts_chunk_sent", {
        conversationId,
        agentId,
        provider,
        model: selectedModel,
        elapsedMs: elapsed(startedAt),
        outputChars
      });
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
      if (event === "no_llm_delta") {
        console.log("[Vapi stream gap] no_llm_delta_for_ms=" + details.elapsedMs, {
          conversationId,
          agentId,
          provider,
          model: selectedModel
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
    latencyMarks.agentLoaded = Date.now();
    // Only gate the stream when forwarding is enabled — otherwise zero overhead and byte-for-byte
    // identical behavior to today.
    if (transferNumberForAgent(agent)) {
      transferGate = createTransferGate({ onCommitText: (text) => smoothBuffer.push(text) });
    }
    enableFirstTokenFiller = enableFirstTokenFiller || agent?.settings?.llm?.enableFirstTokenFiller === true;
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
      latencyMarks.llmStarted = Date.now();
      logLatency("llm_started", {
        conversationId,
        agentId,
        provider,
        model: selectedModel,
        elapsedMs: elapsed(startedAt)
      });
      scheduleFirstTokenWarning();

      for await (const part of streamAgent({ agent, userMessage: userText, conversationId, voiceMode: true })) {
        if (!part) continue;
        if (!sawFirstLlmToken) {
          sawFirstLlmToken = true;
          clearFirstTokenWarningTimer();
          latencyMarks.firstLlmToken = Date.now();
          const llmTokenElapsed = latencyMarks.firstLlmToken - latencyMarks.llmStarted;
          logLatency("first_llm_token", {
            conversationId,
            agentId,
            provider,
            model: selectedModel,
            elapsedMs: elapsed(startedAt),
            outputChars
          });
          if (llmTokenElapsed > 2500) {
            console.warn("[Vapi warning] first_llm_token_delayed", {
              conversationId,
              agentId,
              provider,
              model: selectedModel,
              elapsedMs: llmTokenElapsed
            });
          }
        }
        if (transferGate) {
          if (transferGate.push(part)) {
            transferRequested = true;
            break; // transfer decided — nothing was flushed; emit the tool call below
          }
        } else {
          smoothBuffer.push(part);
        }
      }
    }
  } catch (error) {
    clearFirstTokenWarningTimer();
    logLatency("stream_failed", {
      conversationId,
      agentId,
      provider,
      model: selectedModel,
      elapsedMs: elapsed(startedAt),
      outputChars
    });
    console.error("[Vapi chat] stream failed:", error.message);

    if (!sawFirstSseFlush && !smoothBuffer.hasBufferedContent && !transferRequested) {
      for (const part of fallbackStream()) {
        smoothBuffer.push(part);
      }
    }
  }

  // Human warm transfer: the gate saw the sentinel and held back all text, so NOTHING has been
  // written for this turn. Emit a content-free transferCall tool call as the first and only write,
  // so Vapi accepts it and asks our webhook for the destination.
  if (transferRequested) {
    clearFirstTokenWarningTimer();
    if (sawFirstSseFlush) {
      // Guard: if any content reached Vapi first (e.g. a first-token filler), the transfer turn is
      // poisoned and Vapi will ignore the tool call. Loud error so this never fails silently.
      console.error("[Vapi transfer] content was flushed before the tool call — Vapi will ignore this transfer", {
        conversationId,
        agentId,
        outputChars
      });
    }
    writeTransferToolCallSSE(res, { id, created, model: selectedModel });
    latencyMarks.streamDone = Date.now();
    logLatency("transfer_requested", {
      conversationId,
      agentId,
      provider,
      model: selectedModel,
      elapsedMs: elapsed(startedAt)
    });
    logLatencyBreakdown();
    return;
  }

  // No transfer: flush any tail the gate held back (partial-sentinel guard).
  if (transferGate) transferGate.flush();

  await smoothBuffer.flushFinal({ logTotal: false });

  if (!sawFirstSseFlush) {
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
  console.log("[Vapi stream smoothing] max_gap_between_flushes=" + smoothBuffer.maxGapBetweenFlushes, {
    conversationId,
    agentId
  });

  res.write(streamChunk({ id, created, model: selectedModel, delta: {}, finishReason: "stop" }));
  res.write("data: [DONE]\n\n");
  res.end();
  clearFirstTokenWarningTimer();
  latencyMarks.streamDone = Date.now();
  logLatency("stream_done", {
    conversationId,
    agentId,
    provider,
    model: selectedModel,
    elapsedMs: elapsed(startedAt),
    outputChars
  });
  logLatencyBreakdown();
}
