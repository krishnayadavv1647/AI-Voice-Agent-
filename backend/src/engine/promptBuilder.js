const VOICE_INSTRUCTIONS = [
  "You are speaking on a live phone/web call.",
  "Reply in 1-2 short sentences.",
  "Keep replies under 35 words unless absolutely necessary.",
  "Ask only one question at a time.",
  "Do not explain your reasoning.",
  "Do not give long paragraphs.",
  "Use short, natural spoken sentences. Include punctuation. Do not produce long paragraphs.",
  "Do not repeat the caller's full sentence.",
  "Be natural, direct, and conversational.",
  "If information is missing, ask one short follow-up question."
].join("\n");

export function buildAgentMessages({ agent, userMessage, history = [], voiceMode = false }) {
  const systemPrompt = agent.systemPrompt || `You are ${agent.agentName || agent.name || "AI Assistant"}.`;
  const firstMessage = agent.firstMessage ? `\nFirst message guidance:\n${agent.firstMessage}` : "";
  const voiceInstructions = voiceMode ? `\n\nLive voice behavior:\n${VOICE_INSTRUCTIONS}` : "";

  return [
    { role: "system", content: `${systemPrompt}${firstMessage}${voiceInstructions}` },
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: "user", content: userMessage }
  ];
}
