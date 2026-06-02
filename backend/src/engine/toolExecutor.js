export async function executeTool(tool, input) {
  return {
    tool: tool?.name || "unknown",
    input,
    result: "Tool execution placeholder. Configure a real tool adapter to run this action."
  };
}
