import { transferNumberForAgent } from "../utils/phone.js";
import { TRANSFER_SENTINEL } from "./transferSignal.js";

const VOICE_INSTRUCTIONS = [
  "You are speaking on a live phone or web call.",
  "Give helpful, natural spoken replies.",
  "Use 2-4 short sentences when needed.",
  "Keep most replies between 45-80 words.",
  "For simple questions, answer briefly.",
  "For booking, pricing, menu, or service questions, give enough useful context.",
  "Ask only one question at the end.",
  "Use clear punctuation.",
  "Do not give long lectures.",
  "Do not sound robotic.",
  "Do not make every answer tiny.",
  "Do not make every answer long.",
  "Match the answer length to the caller's question.",
  "For restaurant, order, or booking calls, give enough information to move the conversation forward.",
  "Ask only one question at a time.",
  "Do not explain your reasoning.",
  "Do not repeat the caller's full sentence."
].join("\n");

// Oversized agent system prompts inflate Gemini time-to-first-token on live voice calls, so cap
// them and warn once per agent instead of silently eating the latency on every call.
const MAX_VOICE_SYSTEM_PROMPT_CHARS = 6000;
const voiceTruncationWarned = new Set();

function truncateForVoice(systemPrompt, agentId) {
  if (systemPrompt.length <= MAX_VOICE_SYSTEM_PROMPT_CHARS) return systemPrompt;

  const slice = systemPrompt.slice(0, MAX_VOICE_SYSTEM_PROMPT_CHARS);
  const lastSpace = slice.lastIndexOf(" ");
  const truncated = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;

  if (agentId && !voiceTruncationWarned.has(agentId)) {
    voiceTruncationWarned.add(agentId);
    console.warn("[promptBuilder] system prompt truncated for voice", {
      agentId,
      originalChars: systemPrompt.length
    });
  }

  return `${truncated}\n[Instructions truncated for live call latency.]`;
}

export function buildAgentMessages({ agent, userMessage, history = [], voiceMode = false }) {
  let systemPrompt = agent.systemPrompt || `You are ${agent.agentName || agent.name || "AI Assistant"}.`;
  if (voiceMode) {
    systemPrompt = truncateForVoice(systemPrompt, agent?._id?.toString?.() || agent?._id);
  }
  const firstMessage = agent.firstMessage ? `\nFirst message guidance:\n${agent.firstMessage}` : "";
  const voiceInstructions = voiceMode ? `\n\nLive voice behavior:\n${VOICE_INSTRUCTIONS}` : "";

  // Human warm-transfer guidance — only when the agent has a valid forwarding number (mirrors the
  // transferCall tool attached in vapi.service.js). Appended AFTER the voice truncation above so it
  // is never cut, and kept short to protect voice time-to-first-token. The model signals a transfer
  // by emitting TRANSFER_SENTINEL, which the streaming controller turns into a real transferCall
  // tool call (the token itself is stripped and never spoken).
  const forwardingOn = !!transferNumberForAgent(agent);
  const transferGuidance = forwardingOn
    ? `\n\nHandoff rule: Normally you answer the caller yourself — that is your default in every turn. ` +
      `There is one exception: if the caller explicitly asks for a human/agent/representative, or you ` +
      `truly cannot answer, then reply with the single token ${TRANSFER_SENTINEL} and no other text. ` +
      `Do not use that token for greetings, ordinary questions, or anything you can answer.`
    : "";

  return [
    { role: "system", content: `${systemPrompt}${firstMessage}${transferGuidance}${voiceInstructions}` },
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: "user", content: userMessage }
  ];
}
