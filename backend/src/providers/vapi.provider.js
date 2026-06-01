export const VapiProvider = {
  async create() {
    throw new Error("Vapi provider is not configured yet");
  },

  async update() {
    throw new Error("Vapi provider is not configured yet");
  },

  async archive(agent) {
    return {
      provider: "vapi",
      providerWorkflowId: agent.providerWorkflowId || null,
      providerAgentId: agent.providerAgentId || null,
      status: "archive_skipped_not_configured",
      message: "Vapi provider is not configured. Local agent was archived without calling Vapi."
    };
  },

  async startCall() {
    throw new Error("Vapi provider is not configured yet");
  },

  async endCall() {
    throw new Error("Vapi provider is not configured yet");
  }
};
