import Agent from "../models/Agent.js";
import { DograhProvider } from "../providers/dograh.provider.js";
import { getDograhClientForAgent } from "./dograhClientResolver.js";
import { syncAgentLLMConfigurationToDograh } from "./dograhLLMConfigSync.service.js";
import { syncAgentVoiceConfigurationToDograh } from "./dograhVoiceConfigSync.service.js";
import { assertRuntimeVerification, verifyDograhWorkflowRuntime } from "./dograhWorkflowConfig.service.js";

function readSyncError(error) {
  const data = error?.response?.data || error?.details?.dograhError || error?.details;
  const detail = data?.message || data?.error || data?.detail || data?.userMessage;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return JSON.stringify(detail);
  if (detail && typeof detail === "object") return "Dograh workflow sync failed. Check provider configuration.";
  if (typeof data === "string") return data;
  if (data && typeof data === "object") return error?.message || "Dograh workflow sync failed. Check provider configuration.";
  return error?.message || "Dograh workflow sync failed.";
}

export async function syncDograhWorkflow(agent) {
  const expectedVersion = agent.workflowVersion;

  try {
    const latestAgent = await Agent.findById(agent._id);
    if (!latestAgent) return null;

    const providerResult = await DograhProvider.update(latestAgent);
    const workflowId = providerResult.dograhWorkflowId || providerResult.providerWorkflowId || latestAgent.dograhWorkflowId || latestAgent.providerWorkflowId;
    const resolved = await getDograhClientForAgent(latestAgent, latestAgent.userId);
    const verification = await verifyDograhWorkflowRuntime({
      agent: latestAgent,
      userId: latestAgent.userId,
      callType: "workflow_sync",
      fetchWorkflow: async () => {
        const response = await resolved.client.get(`/workflow/fetch/${encodeURIComponent(workflowId)}`);
        return response.data;
      }
    });
    assertRuntimeVerification(verification);

    const syncedAt = new Date();
    const set = {
      provider: "dograh",
      providerWorkflowId: providerResult.providerWorkflowId || latestAgent.providerWorkflowId || latestAgent.dograhWorkflowId,
      providerAgentId: providerResult.providerAgentId || latestAgent.providerAgentId || latestAgent.dograhAgentId,
      dograhAgentId: providerResult.dograhAgentId || latestAgent.dograhAgentId || providerResult.providerAgentId,
      dograhWorkflowId: providerResult.dograhWorkflowId || latestAgent.dograhWorkflowId || providerResult.providerWorkflowId,
      dograhWorkflowUuid: providerResult.dograhWorkflowUuid || latestAgent.dograhWorkflowUuid,
      dograhWorkflowName: providerResult.dograhWorkflowName || latestAgent.dograhWorkflowName || latestAgent.agentName,
      dograhStatus: "connected",
      workflowStatus: "connected",
      workflowSyncStatus: "synced",
      dograhSyncStatus: "Workflow Synced",
      dograhConnection: "Connected",
      dograhNeedsUpdate: false,
      dograhRawResponse: providerResult.raw || latestAgent.dograhRawResponse,
      workflowLastSyncedAt: syncedAt,
      dograhLastSyncedAt: syncedAt,
      lastSyncedAt: syncedAt,
      status: "Connected"
    };

    for (const [key, value] of Object.entries(set)) {
      if (value === undefined) delete set[key];
    }

    await Agent.updateOne(
      { _id: latestAgent._id, workflowVersion: expectedVersion },
      { $set: set, $unset: { workflowSyncError: "", dograhError: "" } },
      { runValidators: true }
    );

    return providerResult;
  } catch (error) {
    const errorMessage = readSyncError(error);
    console.error("Dograh workflow background sync failed:", error.message);

    await Agent.updateOne(
      { _id: agent._id, workflowVersion: expectedVersion },
      {
        $set: {
          workflowSyncStatus: "failed",
          workflowSyncError: errorMessage,
          dograhStatus: "update_failed",
          dograhSyncStatus: "Workflow Failed",
          dograhError: errorMessage,
          dograhNeedsUpdate: true
        }
      },
      { runValidators: true }
    );

    return null;
  }
}

export async function syncAgentDograhRuntime(agent) {
  const expectedVersion = agent.workflowVersion;
  const latestAgent = await Agent.findById(agent._id);
  if (!latestAgent) return null;

  try {
    const providerResult = await DograhProvider.update(latestAgent);
    const syncedAt = new Date();
    const workflowPatch = {
      provider: "dograh",
      providerWorkflowId: providerResult.providerWorkflowId || latestAgent.providerWorkflowId || latestAgent.dograhWorkflowId,
      providerAgentId: providerResult.providerAgentId || latestAgent.providerAgentId || latestAgent.dograhAgentId,
      dograhAgentId: providerResult.dograhAgentId || latestAgent.dograhAgentId || providerResult.providerAgentId,
      dograhWorkflowId: providerResult.dograhWorkflowId || latestAgent.dograhWorkflowId || providerResult.providerWorkflowId,
      dograhWorkflowUuid: providerResult.dograhWorkflowUuid || latestAgent.dograhWorkflowUuid,
      dograhWorkflowName: providerResult.dograhWorkflowName || latestAgent.dograhWorkflowName || latestAgent.agentName,
      dograhStatus: "syncing",
      workflowStatus: "connected",
      workflowSyncStatus: "syncing",
      dograhSyncStatus: "Runtime Syncing",
      dograhConnection: "Connected",
      dograhNeedsUpdate: false,
      dograhRawResponse: providerResult.raw || latestAgent.dograhRawResponse,
      workflowLastSyncedAt: syncedAt,
      dograhLastSyncedAt: syncedAt,
      lastSyncedAt: syncedAt,
      status: "Connected"
    };

    for (const [key, value] of Object.entries(workflowPatch)) {
      if (value === undefined) delete workflowPatch[key];
    }

    await Agent.updateOne(
      { _id: latestAgent._id, workflowVersion: expectedVersion },
      { $set: workflowPatch, $unset: { workflowSyncError: "", dograhError: "" } },
      { runValidators: true }
    );

    const refreshedAgent = await Agent.findById(latestAgent._id);
    const llmConfiguration = await syncAgentLLMConfigurationToDograh({ agent: refreshedAgent, userId: refreshedAgent.userId });
    const voiceConfiguration = await syncAgentVoiceConfigurationToDograh({ agent: refreshedAgent, userId: refreshedAgent.userId });
    const providerSyncErrors = [
      ["failed", "configuration_required"].includes(llmConfiguration?.dograhSyncStatus)
        ? `LLM initialization failed: ${llmConfiguration.dograhSyncError || "Check LLM provider configuration."}`
        : "",
      ["failed", "configuration_required"].includes(voiceConfiguration?.dograhSyncStatus)
        ? `TTS/STT initialization failed: ${voiceConfiguration.dograhSyncError || "Check voice provider configuration."}`
        : ""
    ].filter(Boolean);
    if (providerSyncErrors.length) {
      throw new Error(providerSyncErrors.join(" "));
    }

    const workflowId = refreshedAgent.dograhWorkflowId || refreshedAgent.providerWorkflowId;
    const resolved = await getDograhClientForAgent(refreshedAgent, refreshedAgent.userId);
    const verification = await verifyDograhWorkflowRuntime({
      agent: refreshedAgent,
      userId: refreshedAgent.userId,
      callType: "runtime_sync",
      fetchWorkflow: async () => {
        const response = await resolved.client.get(`/workflow/fetch/${encodeURIComponent(workflowId)}`);
        return response.data;
      }
    });
    assertRuntimeVerification(verification);

    await Agent.updateOne(
      { _id: refreshedAgent._id, workflowVersion: expectedVersion },
      {
        $set: {
          dograhStatus: "connected",
          workflowStatus: "connected",
          workflowSyncStatus: "synced",
          dograhSyncStatus: "Runtime Synced",
          dograhConnection: "Connected",
          dograhNeedsUpdate: false,
          workflowLastSyncedAt: new Date(),
          dograhLastSyncedAt: new Date(),
          lastSyncedAt: new Date()
        },
        $unset: { workflowSyncError: "", dograhError: "", dograhEmbedToken: "" }
      },
      { runValidators: true }
    );

    return { providerResult, llmConfiguration, voiceConfiguration, verification };
  } catch (error) {
    const errorMessage = readSyncError(error);
    console.error("Dograh runtime sync failed:", error.message);

    await Agent.updateOne(
      { _id: agent._id, workflowVersion: expectedVersion },
      {
        $set: {
          workflowSyncStatus: "failed",
          workflowSyncError: errorMessage,
          dograhStatus: "update_failed",
          dograhSyncStatus: "Runtime Sync Failed",
          dograhError: errorMessage,
          dograhNeedsUpdate: true
        }
      },
      { runValidators: true }
    );

    return {
      providerResult: null,
      llmConfiguration: null,
      voiceConfiguration: null,
      verification: null,
      error: errorMessage
    };
  }
}
