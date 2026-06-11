import {
  archiveDograhWorkflowById,
  createDograhWorkflowFromDefinition,
  resolveDograhWorkflowFields,
  triggerDograhOutboundCallByWorkflow,
  updateDograhWorkflowById
} from "../services/dograh.service.js";

function getExistingWorkflowId(agent) {
  const hasRealWorkflow = Boolean(agent.dograhWorkflowId || agent.dograhWorkflowUuid);
  return hasRealWorkflow ? (agent.providerWorkflowId || agent.dograhWorkflowId || agent.workflowId) : null;
}

export const DograhProvider = {
  async create(agent) {
    const existingWorkflowId = getExistingWorkflowId(agent);

    if (existingWorkflowId) {
      console.log("[Provider Sync]", {
        agentId: agent._id.toString(),
        provider: "dograh",
        providerWorkflowId: existingWorkflowId,
        action: "create",
        externalWorkflowCreated: false
      });

      return {
        provider: "dograh",
        providerWorkflowId: existingWorkflowId,
        dograhWorkflowId: existingWorkflowId,
        dograhWorkflowUuid: agent.dograhWorkflowUuid,
        dograhWorkflowName: agent.dograhWorkflowName,
        status: "already_exists"
      };
    }

    console.log("[Provider Sync]", {
      agentId: agent._id.toString(),
      provider: "dograh",
      providerWorkflowId: null,
      action: "create",
      externalWorkflowCreated: true
    });

    const response = await createDograhWorkflowFromDefinition(agent);
    const fields = await resolveDograhWorkflowFields(response, agent.userId);

    if (!fields.dograhWorkflowId) {
      throw new Error("Dograh create succeeded but workflow ID was not returned");
    }

    const dograhAgentId = fields.dograhAgentId || fields.dograhWorkflowId;

    return {
      provider: "dograh",
      providerWorkflowId: fields.dograhWorkflowId,
      providerAgentId: dograhAgentId,
      dograhWorkflowId: fields.dograhWorkflowId,
      dograhAgentId,
      dograhWorkflowUuid: fields.dograhWorkflowUuid,
      dograhWorkflowName: fields.dograhWorkflowName,
      status: fields.dograhWorkflowUuid ? "created" : "created_missing_uuid",
      raw: response
    };
  },

  async update(agent) {
    const workflowId = getExistingWorkflowId(agent);

    if (!workflowId) {
      throw new Error("Cannot update Dograh workflow because workflow ID is missing");
    }

    console.log("[Provider Sync]", {
      agentId: agent._id.toString(),
      provider: "dograh",
      providerWorkflowId: workflowId,
      action: "update",
      externalWorkflowCreated: false
    });

    const response = await updateDograhWorkflowById(workflowId, agent);
    const fields = await resolveDograhWorkflowFields(response, agent.userId);

    return {
      provider: "dograh",
      providerWorkflowId: workflowId,
      providerAgentId: agent.providerAgentId || agent.dograhAgentId || workflowId,
      dograhWorkflowId: workflowId,
      dograhAgentId: agent.dograhAgentId || agent.providerAgentId || workflowId,
      dograhWorkflowUuid: fields.dograhWorkflowUuid || agent.dograhWorkflowUuid,
      dograhWorkflowName: fields.dograhWorkflowName || agent.dograhWorkflowName,
      status: "updated",
      raw: response
    };
  },

  async archive(agent) {
    const workflowId = getExistingWorkflowId(agent);

    if (!workflowId) {
      throw new Error("Cannot archive Dograh workflow because workflow ID is missing");
    }

    console.log("[Provider Sync]", {
      agentId: agent._id.toString(),
      provider: "dograh",
      providerWorkflowId: workflowId,
      action: "archive",
      externalWorkflowCreated: false
    });

    const response = await archiveDograhWorkflowById(workflowId, { userId: agent.userId });

    return {
      provider: "dograh",
      providerWorkflowId: workflowId,
      dograhWorkflowId: workflowId,
      dograhWorkflowUuid: agent.dograhWorkflowUuid,
      dograhWorkflowName: agent.dograhWorkflowName,
      status: "archived",
      raw: response
    };
  },

  async startCall(agent, payload) {
    if (!agent.dograhWorkflowUuid) {
      throw new Error("Cannot start Dograh call because workflow UUID is missing");
    }

    const response = await triggerDograhOutboundCallByWorkflow(agent.dograhWorkflowUuid, payload, { userId: agent.userId });

    return {
      provider: "dograh",
      providerWorkflowId: getExistingWorkflowId(agent),
      status: response?.status || "call_started",
      raw: response
    };
  },

  async endCall() {
    return {
      provider: "dograh",
      status: "end_call_not_supported",
      message: "Dograh call ending is controlled by Dograh workflow runtime."
    };
  }
};
