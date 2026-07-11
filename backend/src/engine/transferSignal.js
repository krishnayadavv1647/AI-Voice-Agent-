// Bridges a text-only custom-LLM stream to a Vapi warm transfer.
//
// Vapi only executes its `transferCall` tool when the /chat/completions response returns an
// OpenAI-style `tool_calls` chunk with finish_reason "tool_calls" — plain narration text does
// nothing. Our engine streams plain text, so we let the model signal a transfer by emitting a
// SILENT sentinel token (TRANSFER_SENTINEL); the controller detects it, suppresses it from the
// caller's audio, and re-emits it as a bare `transferCall` tool call (no arguments -> no
// destination -> Vapi asks our webhook for the number).

export const TRANSFER_SENTINEL = "<<TRANSFER>>";

// Streaming detector. Feed it text deltas; it forwards everything safe to `onText` while holding
// back only a trailing fragment that could be the start of the sentinel, so a partial sentinel is
// never spoken. Returns true from push() once the full sentinel has been seen.
export function createSentinelFilter({ sentinel = TRANSFER_SENTINEL, onText } = {}) {
  if (typeof onText !== "function") throw new Error("createSentinelFilter requires onText.");
  let carry = "";
  let detected = false;

  // Longest k (>0) such that carry ends with sentinel.slice(0, k): a possible partial sentinel to
  // hold back until more text arrives or the stream ends.
  function partialSuffixLen(s) {
    const max = Math.min(s.length, sentinel.length - 1);
    for (let k = max; k > 0; k -= 1) {
      if (s.slice(s.length - k) === sentinel.slice(0, k)) return k;
    }
    return 0;
  }

  return {
    // Returns true once the sentinel has appeared (caller should stop consuming the stream).
    push(part) {
      if (detected) return true;
      carry += String(part ?? "");

      const idx = carry.indexOf(sentinel);
      if (idx !== -1) {
        const before = carry.slice(0, idx);
        if (before) onText(before); // speak whatever preceded the signal, drop the rest of the turn
        carry = "";
        detected = true;
        return true;
      }

      const hold = partialSuffixLen(carry);
      const flushable = carry.slice(0, carry.length - hold);
      if (flushable) onText(flushable);
      carry = hold ? carry.slice(carry.length - hold) : "";
      return false;
    },
    // Flush any held-back tail. Call only when the sentinel was NOT detected.
    flush() {
      if (detected) { carry = ""; return; }
      if (carry) { onText(carry); carry = ""; }
    },
    get detected() {
      return detected;
    }
  };
}

// Emit a bare `transferCall` tool call on the open SSE stream, then end the response. Empty
// arguments ("{}") means no destination, which forces Vapi's transfer-destination-request webhook.
export function writeTransferToolCallSSE(res, { id, created, model, toolCallId = "call_transfer_1" } = {}) {
  const base = {
    id: id || `chatcmpl-transfer-${Date.now()}`,
    object: "chat.completion.chunk",
    created: created || Math.floor(Date.now() / 1000),
    model: model || "custom-llm"
  };

  // 1) the tool-call delta
  res.write(`data: ${JSON.stringify({
    ...base,
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: 0,
          id: toolCallId,
          type: "function",
          function: { name: "transferCall", arguments: "{}" }
        }]
      },
      finish_reason: null
    }]
  })}\n\n`);

  // 2) terminate the turn as a tool call
  res.write(`data: ${JSON.stringify({
    ...base,
    choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }]
  })}\n\n`);

  res.write("data: [DONE]\n\n");
  res.end();
}
