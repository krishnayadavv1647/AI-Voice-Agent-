import { runCustomAgent as runEngineAgent } from "../engine/agentRuntime.js";

export async function runCustomAgent({ systemPrompt, userMessage, conversationId, tools = [], settings = {}, agent = {} }) {
  const result = await runEngineAgent({
    agent: {
      ...agent,
      systemPrompt,
      tools,
      settings
    },
    userMessage,
    conversationId
  });

  return result.reply;
}
