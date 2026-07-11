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

  return [
    { role: "system", content: `${systemPrompt}${firstMessage}${voiceInstructions}` },
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: "user", content: userMessage }
  ];
}
