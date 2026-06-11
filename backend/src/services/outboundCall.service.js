import CallLog from "../models/CallLog.js";
import { applyCallOutcomeToLog } from "./callOutcome.service.js";
import { extractCallFields, extractRunId } from "./callLogMapper.js";
import { scheduleDograhStatusSync } from "./dograhCallStatusSync.service.js";
import { triggerDograhOutboundCallByWorkflow } from "./dograh.service.js";
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

function dograhCallPayload(agent, phoneNumber, metadata = {}) {
  const webhookUrl = getDograhWebhookUrl();

  return {
    phone_number: phoneNumber,
    calling_number: agent.callerIdNumber,
    webhook_url: webhookUrl,

    initial_context: {
      businessName: agent.businessName,
      agentName: agent.agentName,
      localAgentId: agent._id.toString(),
      userId: agent.userId.toString(),
      ...metadata,
    },

    metadata: {
      localAgentId: agent._id.toString(),
      userId: agent.userId.toString(),
      dograhWorkflowUuid: agent.dograhWorkflowUuid,
      webhookUrl,
      ...metadata,
    },
  };
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
      "workflowUuid is required. Connect a Dograh workflow before triggering calls."
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
      "callerIdNumber is required. Connect a Dograh workflow with a caller ID number."
    );
  }

  assertE164(phoneNumber, "Phone number");
  assertE164(agent.callerIdNumber, "Caller ID number");

  const payload = dograhCallPayload(agent, phoneNumber, metadata);
  const dograhResponse = await trigger(agent.dograhWorkflowUuid, payload, { userId: userId || agent.userId });
  const dograhRunId = extractRunId(dograhResponse);
  const responseFields = extractCallFields(dograhResponse);

  console.log("Dograh trigger response:", JSON.stringify(dograhResponse, null, 2));
  console.log("Auto extracted dograhRunId:", dograhRunId);
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
    dograhWorkflowUuid: agent.dograhWorkflowUuid,
    dograhRunId,
    callerNumber: phoneNumber,
    callingNumber: agent.callerIdNumber
  });

  return { dograhResponse, callLog };
}
