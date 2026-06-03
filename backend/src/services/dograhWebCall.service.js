import { ApiError } from "../utils/apiError.js";

export function buildDograhWidgetConfig({ workflowId, agent }) {
  if (!workflowId) {
    throw new ApiError(400, "Dograh workflow ID missing.");
  }

  if (!agent) {
    throw new ApiError(400, "Agent is required before starting a Dograh web call.");
  }

  return {
    workflowId,
    workflow_id: workflowId,
    workflowUuid: agent.dograhWorkflowUuid || null,
    workflow_uuid: agent.dograhWorkflowUuid || null,
    agentId: agent.dograhAgentId || agent.providerAgentId || null,
    localAgentId: agent._id?.toString(),
    agentName: agent.agentName || agent.name,
    businessName: agent.businessName,
    language: agent.language,
    metadata: {
      localAgentId: agent._id?.toString(),
      source: "browser_web_call"
    }
  };
}

export async function endDograhWebCall() {
  return { success: true, skipped: true, reason: "Dograh widget handles browser call termination." };
}

export async function getDograhWebCallTranscript() {
  return { success: true, skipped: true, reason: "Dograh widget callbacks provide transcript data when available." };
}

export async function getDograhWebCallRecording() {
  return { success: true, skipped: true, reason: "Dograh widget callbacks provide recording data when available." };
}
