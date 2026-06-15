import { generateLLMResponse } from "../llm/index.js";
import { getConversationHistory, saveConversationMessage } from "./memoryService.js";
import { buildAgentMessages } from "./promptBuilder.js";
import { runWorkflowNode } from "./workflowRunner.js";

export async function runCustomAgent({ agent, userMessage, conversationId }) {
  const history = getConversationHistory(conversationId);
  const workflowState = runWorkflowNode({ agent, userMessage });
  const messages = buildAgentMessages({ agent, userMessage, history });

  const reply = await generateLLMResponse({
    provider: agent.llmProvider || process.env.DEFAULT_LLM_PROVIDER || "dograh_default",
    model: agent.llmModel,
    messages,
    settings: agent.settings || {}
  });

  saveConversationMessage(conversationId, { role: "user", content: userMessage });
  saveConversationMessage(conversationId, { role: "assistant", content: reply });

  return {
    reply,
    workflowState
  };
}
