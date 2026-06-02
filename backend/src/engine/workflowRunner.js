export function runWorkflowNode({ agent, userMessage }) {
  const nodes = agent.workflowNodes?.length ? agent.workflowNodes : agent.nodes || [];
  const startNode = nodes.find((node) => node.type === "start") || nodes[0] || null;

  return {
    startNodeId: startNode?.id || null,
    action: "respond",
    userMessage
  };
}
