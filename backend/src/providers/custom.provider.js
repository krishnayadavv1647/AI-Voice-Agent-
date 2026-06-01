export const CustomProvider = {
  async create(agent) {
    return {
      provider: "custom",
      providerWorkflowId: agent.providerWorkflowId || agent._id.toString(),
      status: "created"
    };
  },

  async update(agent) {
    return {
      provider: "custom",
      providerWorkflowId: agent.providerWorkflowId || agent._id.toString(),
      status: "updated"
    };
  },

  async archive(agent) {
    return {
      provider: "custom",
      providerWorkflowId: agent.providerWorkflowId || agent._id.toString(),
      status: "archived"
    };
  },

  async startCall(agent, payload) {
    return {
      provider: "custom",
      providerWorkflowId: agent.providerWorkflowId || agent._id.toString(),
      status: "call_started",
      payload
    };
  },

  async endCall(agent, payload) {
    return {
      provider: "custom",
      providerWorkflowId: agent.providerWorkflowId || agent._id.toString(),
      status: "call_ended",
      payload
    };
  }
};
