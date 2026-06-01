import { runCustomAgent as runEngineAgent } from "../engine/agentRuntime.js";

export async function runCustomAgent({ systemPrompt, userMessage, tools = [], settings = {}, agent = {} }) {
  const result = await runEngineAgent({
    agent: {
      ...agent,
      systemPrompt,
      tools,
      settings
    },
    userMessage
  });

  return result.reply;
}
