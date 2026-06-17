import CallLog from "../models/CallLog.js";
import { applyCallOutcomeToLog } from "./callOutcome.service.js";
import { extractCallFields, extractRunId } from "./callLogMapper.js";
import { scheduleDograhStatusSync } from "./dograhCallStatusSync.service.js";
import { triggerDograhOutboundCallByWorkflow } from "./dograh.service.js";
import { getDograhClientForAgent } from "./dograhClientResolver.js";
import { getDograhLLMRuntimeSummary } from "./dograhLLMConfigSync.service.js";
import { assertDograhVoiceReadyForWebCall } from "./dograhVoiceConfigSync.service.js";
import { assertRuntimeVerification, verifyDograhWorkflowRuntime } from "./dograhWorkflowConfig.service.js";
import { ApiError } from "../utils/apiError.js";

function assertE164(value, fieldName) {
  if (!value || !/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new ApiError(
      400,
      `${fieldName} must be in E.164 format, for example +17578297060`
    );
  }
}

function getDograhWebhookUrl() {
  const backendUrl = process.env.PUBLIC_BACKEND_URL?.trim().replace(/\/$/, "");

  if (!backendUrl) {
    throw new ApiError(
      500,
      "PUBLIC_BACKEND_URL is missing. Set it to your deployed backend URL."
    );
  }

  if (backendUrl.includes("localhost") || backendUrl.includes("127.0.0.1")) {
    throw new ApiError(
      500,
      "PUBLIC_BACKEND_URL must be a deployed public backend URL, not localhost."
    );
  }

  const webhookUrl = `${backendUrl}/api/webhooks/dograh`;

  if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    throw new ApiError(
      500,
      "Generated webhook URL is invalid because it contains localhost or 127.0.0.1."
    );
  }

  return webhookUrl;
}

function firstSpokenMessage(agent) {
  const message = [agent?.firstMessage, agent?.greetingMessage]
    .find((item) => item && String(item).trim());

  return String(message || `Hello, welcome to ${agent?.businessName || "our business"}. How can I help you today?`).trim();
}

function dograhCallPayload(agent, phoneNumber, metadata = {}) {
  const webhookUrl = getDograhWebhookUrl();
  const openingMessage = firstSpokenMessage(agent);

  return {
    phone_number: phoneNumber,
    calling_number: agent.callerIdNumber,
    webhook_url: webhookUrl,
    first_message: openingMessage,
    initial_message: openingMessage,
    greeting_message: openingMessage,

    initial_context: {
      businessName: agent.businessName,
      agentName: agent.agentName,
      firstMessage: openingMessage,
      greetingMessage: openingMessage,
      localAgentId: agent._id.toString(),
      userId: agent.userId.toString(),
      ...metadata,
    },

    metadata: {
      localAgentId: agent._id.toString(),
      userId: agent.userId.toString(),
      dograhWorkflowUuid: agent.dograhWorkflowUuid,
      webhookUrl,
      firstMessage: openingMessage,
      ...metadata,
    },
  };
}

function publicCallLog(callLog) {
  const value = callLog?.toObject ? callLog.toObject() : { ...(callLog || {}) };
  delete value.providerPayload;
  delete value.rawDograhPayload;
  delete value.rawWebhookPayload;
  return value;
}

export async function triggerOutboundCallForAgent({
  agent,
  userId,
  phoneNumber,
  leadId,
  source = "dograh",
  metadata = {},
  trigger = triggerDograhOutboundCallByWorkflow
}) {
  if (!agent?.dograhWorkflowUuid) {
    throw new ApiError(
      400,
      "workflowUuid is required. Dograh workflow sync must finish before triggering calls."
    );
  }

  if (!phoneNumber) {
    throw new ApiError(
      400,
      "phoneNumber is required before triggering a Dograh call."
    );
  }

  if (!agent.callerIdNumber) {
    throw new ApiError(
      400,
      "callerIdNumber is required before triggering calls."
    );
  }

  assertE164(phoneNumber, "Phone number");
  assertE164(agent.callerIdNumber, "Caller ID number");

  if (agent.workflowSyncStatus && agent.workflowSyncStatus !== "synced") {
    throw new ApiError(400, agent.workflowSyncError || "Dograh workflow runtime sync is not complete. Save the agent and wait until sync is marked synced.");
  }

  const voiceRuntime = await assertDograhVoiceReadyForWebCall({ agent, userId: userId || agent.userId });
  const llmRuntime = await getDograhLLMRuntimeSummary({ agent, userId: userId || agent.userId });
  if (llmRuntime.requiresSync && llmRuntime.dograhSyncStatus !== "synced") {
    throw new ApiError(400, llmRuntime.dograhSyncError || "Dograh LLM settings are not verified yet. Save the agent and wait until LLM status is synced.", {
      llmRuntime
    });
  }
  const workflowId = agent.dograhWorkflowId || agent.providerWorkflowId;
  if (!workflowId) {
    throw new ApiError(400, "dograhWorkflowId is required before triggering calls.");
  }

  const resolved = await getDograhClientForAgent(agent, userId || agent.userId);
  const runtimeVerification = await verifyDograhWorkflowRuntime({
    agent,
    userId: userId || agent.userId,
    callType: "outbound_phone_call",
    fetchWorkflow: async () => {
      const response = await resolved.client.get(`/workflow/fetch/${encodeURIComponent(workflowId)}`);
      return response.data;
    }
  });
  assertRuntimeVerification(runtimeVerification);

  const payload = dograhCallPayload(agent, phoneNumber, metadata);
  const dograhResponse = await trigger(agent.dograhWorkflowUuid, payload, { userId: userId || agent.userId, agent });
  const dograhRunId = extractRunId(dograhResponse);
  const responseFields = extractCallFields(dograhResponse);

  console.log("Dograh trigger accepted:", {
    localAgentId: agent._id.toString(),
    workflowId,
    workflowUuid: agent.dograhWorkflowUuid,
    dograhRunId: dograhRunId ? String(dograhRunId) : null,
    rawProviderStatus: dograhResponse?.status || dograhResponse?.data?.status || "initiated"
  });
  if (!dograhRunId) {
    console.warn("Dograh run ID missing in trigger response. CallLog will be created, but manual sync needs a run ID.");
  }

  const rawProviderStatus = dograhResponse?.status || dograhResponse?.data?.status || "initiated";
  const callLog = await CallLog.create({
    userId,
    agentId: agent._id,
    dograhWorkflowId: agent.dograhWorkflowId,
    dograhWorkflowUuid: agent.dograhWorkflowUuid,
    dograhRunId: dograhRunId ? String(dograhRunId) : null,
    leadId,
    campaignId: metadata.campaignId,
    campaignRecipientId: metadata.campaignRecipientId,
    callerNumber: phoneNumber,
    callingNumber: agent.callerIdNumber,
    status: rawProviderStatus,
    rawProviderStatus,
    providerPayload: dograhResponse,
    callDirection: "outbound",
    source,
    duration: null,
    durationSeconds: null,
    summary: null,
    transcript: null,
    rawDograhPayload: dograhResponse,
    startedAt: responseFields.startedAt || new Date(),
  });
  await applyCallOutcomeToLog(callLog, rawProviderStatus);
  await callLog.save();
  scheduleDograhStatusSync(callLog._id);

  console.log("Dograh call triggered:", {
    localAgentId: agent._id.toString(),
    workflowId,
    dograhWorkflowUuid: agent.dograhWorkflowUuid,
    dograhConnectionType: agent.dograhConnectionType || "platform",
    dograhIntegrationId: agent.dograhIntegrationId ? String(agent.dograhIntegrationId) : null,
    dograhRunId,
    callerNumber: phoneNumber,
    callingNumber: agent.callerIdNumber,
    effectiveLlmProvider: llmRuntime?.effectiveProvider,
    effectiveLlmModel: llmRuntime?.effectiveModel,
    effectiveTtsProvider: voiceRuntime?.effectiveTtsProvider,
    effectiveTtsModel: voiceRuntime?.effectiveTtsModel,
    effectiveSttProvider: voiceRuntime?.effectiveSttProvider,
    verificationResult: runtimeVerification.ok
  });

  return {
    dograhResponse: {
      status: rawProviderStatus,
      dograhRunId: dograhRunId ? String(dograhRunId) : null
    },
    callLog,
    publicCallLog: publicCallLog(callLog)
  };
}
