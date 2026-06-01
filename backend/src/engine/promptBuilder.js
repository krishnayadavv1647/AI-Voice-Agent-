export function buildAgentMessages({ agent, userMessage, history = [] }) {
  const systemPrompt = agent.systemPrompt || `You are ${agent.agentName || agent.name || "AI Assistant"}.`;
  const firstMessage = agent.firstMessage ? `\nFirst message guidance:\n${agent.firstMessage}` : "";

  return [
    { role: "system", content: `${systemPrompt}${firstMessage}` },
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: "user", content: userMessage }
  ];
}
