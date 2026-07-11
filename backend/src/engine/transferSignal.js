// Bridges a text-only custom-LLM stream to a Vapi warm transfer.
//
// Vapi only executes its `transferCall` tool when the /chat/completions response returns an
// OpenAI-style `tool_calls` chunk with finish_reason "tool_calls". Crucially, a single OpenAI
// streaming turn is EITHER content OR tool_calls — never both. If we stream any `delta.content`
// first, Vapi commits the turn as text and DISCARDS a later tool_calls chunk (so the transfer is
// silently ignored). Therefore a transfer turn must contain ZERO content deltas: the tool_calls
// chunk must be the very first thing written.
//
// Our engine only produces text, so the model signals a transfer by emitting a SILENT sentinel
// token (TRANSFER_SENTINEL) as its ENTIRE reply (see promptBuilder). The gate below holds all text
// until it can prove the turn is not a transfer, so nothing is ever spoken on a transfer turn.

export const TRANSFER_SENTINEL = "<<TRANSFER>>";

// Decision gate for a forwarding-enabled agent's stream. It buffers text WITHOUT emitting until it
// can decide:
//   * the sentinel appears  -> `push` returns true; nothing was emitted; caller emits the tool call.
//   * the text diverges from the sentinel (normal turn) -> commit the buffer and stream normally,
//     defensively stripping the sentinel so it can never be spoken even if the model disobeys.
// `onCommitText(text)` is only ever called on a NORMAL turn.
export function createTransferGate({ sentinel = TRANSFER_SENTINEL, onCommitText, maxDecisionChars = 64 } = {}) {
  if (typeof onCommitText !== "function") throw new Error("createTransferGate requires onCommitText.");

  let mode = "deciding"; // "deciding" | "committed" | "transfer"
  let buffer = "";       // decision-phase holdback (never emitted while deciding)
  let carry = "";        // committed-phase partial-sentinel holdback (defensive strip)

  // Longest k (>0) such that s ends with sentinel.slice(0, k): a possible partial sentinel to hold.
  function partialSuffixLen(s) {
    const max = Math.min(s.length, sentinel.length - 1);
    for (let k = max; k > 0; k -= 1) {
      if (s.slice(s.length - k) === sentinel.slice(0, k)) return k;
    }
    return 0;
  }

  // Emit text with any sentinel occurrence stripped out (normal-turn safety net).
  function emitStripped(text) {
    carry += text;
    let idx;
    while ((idx = carry.indexOf(sentinel)) !== -1) {
      const before = carry.slice(0, idx);
      if (before) onCommitText(before);
      carry = carry.slice(idx + sentinel.length);
    }
    const hold = partialSuffixLen(carry);
    const flushable = carry.slice(0, carry.length - hold);
    if (flushable) onCommitText(flushable);
    carry = hold ? carry.slice(carry.length - hold) : "";
  }

  return {
    // Returns true once a transfer is decided (caller must stop consuming and emit the tool call).
    push(part) {
      const text = String(part ?? "");
      if (mode === "transfer") return true;
      if (mode === "committed") { emitStripped(text); return false; }

      // deciding: hold everything, emit nothing.
      buffer += text;
      if (buffer.includes(sentinel)) { mode = "transfer"; buffer = ""; return true; }

      const trimmed = buffer.replace(/^\s+/, ""); // ignore leading whitespace before the token
      const stillCouldBeSentinel = trimmed.length === 0 || sentinel.startsWith(trimmed);
      if (stillCouldBeSentinel && buffer.length < maxDecisionChars) {
        return false; // undecided — keep holding, DO NOT flush
      }

      // Diverged (or exceeded the window): a normal turn. Commit the buffer and pass through.
      mode = "committed";
      const pending = buffer;
      buffer = "";
      emitStripped(pending);
      return false;
    },
    // Called when the upstream stream ends. Flush anything still held (normal turns only).
    flush() {
      if (mode === "transfer") { buffer = ""; carry = ""; return; }
      if (mode === "deciding") {
        mode = "committed";
        const pending = buffer;
        buffer = "";
        if (pending) emitStripped(pending);
      }
      if (carry) { onCommitText(carry); carry = ""; }
    },
    get transfer() {
      return mode === "transfer";
    }
  };
}

// Emit a bare, CONTENT-FREE `transferCall` tool call as the only thing on this SSE turn, then end
// the response. Empty arguments ("{}") means no destination -> Vapi asks our webhook for the number.
// The caller MUST NOT have written any content delta for this turn (see createTransferGate).
export function writeTransferToolCallSSE(res, { id, created, model, toolCallId = "call_transfer_1" } = {}) {
  const base = {
    id: id || `chatcmpl-transfer-${Date.now()}`,
    object: "chat.completion.chunk",
    created: created || Math.floor(Date.now() / 1000),
    model: model || "custom-llm"
  };

  // 1) role + tool-call opener. `content: null` makes it unambiguously a tool_calls turn, not text.
  res.write(`data: ${JSON.stringify({
    ...base,
    choices: [{
      index: 0,
      delta: {
        role: "assistant",
        content: null,
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

  // 2) terminate the turn as a tool_calls turn
  res.write(`data: ${JSON.stringify({
    ...base,
    choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }]
  })}\n\n`);

  res.write("data: [DONE]\n\n");
  res.end();
}
