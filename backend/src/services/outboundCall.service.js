import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import TelephonyConfig from "../models/TelephonyConfig.js";
import { decryptSecret } from "../utils/secretCrypto.js";
import { ensureVapiPhoneNumber } from "./vapi.service.js";
import { applyCallOutcomeToLog, isPipelineErrorStatus } from "./callOutcome.service.js";
import { extractCallFields, extractRunId } from "./callLogMapper.js";
import { scheduleDograhStatusSync } from "./dograhCallStatusSync.service.js";
import { triggerDograhOutboundCallByWorkflow } from "./dograh.service.js";
import { getDograhClientForAgent } from "./dograhClientResolver.js";
import { getDograhLLMRuntimeSummary } from "./dograhLLMConfigSync.service.js";
import { assertDograhVoiceReadyForWebCall } from "./dograhVoiceConfigSync.service.js";
import { assertRuntimeVerification, verifyDograhWorkflowRuntime } from "./dograhWorkflowConfig.service.js";
import { reserveVoiceCallBilling, releaseVoiceReservation } from "./billing/voiceCallBilling.service.js";
import { getProvider } from "../providers/index.js";
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
    message: openingMessage,
    start_message: openingMessage,
    welcome_message: openingMessage,
    speak_first: true,
    agent_speaks_first: true,
    initial_speaker: "agent",
    call_direction: "outbound",
    is_outbound: true,

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

function hasDograhRuntime(agent) {
  // Only Dograh-specific ids count. providerWorkflowId is provider-agnostic (for a Vapi agent it is
  // the Vapi assistant id), so including it would misroute non-Dograh agents into the Dograh path.
  return Boolean(agent?.dograhWorkflowUuid || agent?.dograhWorkflowId);
}

// Consolidated pre-call / pre-publish readiness validation (no remote Dograh fetch).
// Confirms the agent can place a call: workflow synced, voice + LLM verified, and (when
// required) a phone number / caller ID present. Used by publish; the call triggers below
// run this plus a live workflow read-back verification.
export async function assertDograhAgentReadyForCalls({ agent, userId, requirePhone = false, phoneNumber }) {
  if (agent?.provider !== "dograh") return;

  const workflowId = agent.dograhWorkflowId || agent.providerWorkflowId;
  if (!workflowId || !agent.dograhWorkflowUuid) {
    throw new ApiError(400, "Dograh workflow sync must finish before this agent can place calls. Save the agent and wait until the workflow is synced.");
  }
  if (agent.workflowSyncStatus && agent.workflowSyncStatus !== "synced") {
    throw new ApiError(400, agent.workflowSyncError || "Dograh workflow runtime sync is not complete yet. Save the agent and wait until sync is marked synced.");
  }

  try {
    await assertDograhVoiceReadyForWebCall({ agent, userId: userId || agent.userId });
  } catch (error) {
    throw new ApiError(400, error.safeMessage || error.message || "The selected voice provider is not verified with Dograh yet.", { configurationRequired: true });
  }

  const llmRuntime = await getDograhLLMRuntimeSummary({ agent, userId: userId || agent.userId });
  if (llmRuntime.requiresSync && llmRuntime.dograhSyncStatus !== "synced") {
    throw new ApiError(400, llmRuntime.dograhSyncError || "Dograh LLM settings are not verified yet. Save the agent and wait until the LLM status is synced.", { llmRuntime });
  }

  if (requirePhone) {
    if (!phoneNumber) throw new ApiError(400, "phoneNumber is required before triggering a Dograh call.");
    if (!agent.callerIdNumber) throw new ApiError(400, "callerIdNumber is required before triggering calls.");
    assertE164(phoneNumber, "Phone number");
    assertE164(agent.callerIdNumber, "Caller ID number");
  }
}

// Lazily create the provider assistant if it is missing, so agents created before auto-wiring
// (or whose create was swallowed) can still place a call. Persists providerAgentId so the webhook
// and future calls can correlate. Surfaces the real create error (e.g. missing VAPI_PRIVATE_KEY)
// instead of the generic "assistant is not created yet" from startCall.
async function ensureProviderAssistant(agent) {
  if (agent.provider === "dograh" || agent.providerAgentId) return;

  const created = await getProvider(agent.provider).create(agent);
  const providerAgentId = created?.providerAgentId;
  if (!providerAgentId) return; // e.g. CustomProvider returns no agent id and needs none.

  const providerWorkflowId = agent.providerWorkflowId || created.providerWorkflowId || providerAgentId;
  agent.providerAgentId = providerAgentId;
  agent.providerWorkflowId = providerWorkflowId;
  await Agent.updateOne(
    { _id: agent._id },
    { $set: { provider: agent.provider, providerAgentId, providerWorkflowId } }
  );
}

const VAPI_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Auto-provision the Vapi phone-number id: if the agent has no valid UUID yet, import its Twilio
// number into Vapi (reusing it if already imported) and persist the returned id. Twilio credentials
// come from the agent's linked telephony config, so no manual dashboard step or env var is needed.
async function ensureVapiPhoneNumberId(agent) {
  if (agent.provider !== "vapi") return;
  if (agent.vapiPhoneNumberId && VAPI_UUID_PATTERN.test(String(agent.vapiPhoneNumberId).trim())) return;

  let config = agent.telephonyConfigId ? await TelephonyConfig.findById(agent.telephonyConfigId) : null;
  if (!config) {
    config = await TelephonyConfig.findOne({ userId: agent.userId, provider: "twilio", status: "active" }).sort({ createdAt: -1 });
  }
  if (!config || config.provider !== "twilio") {
    throw new ApiError(
      400,
      "To auto-create the Vapi phone number, link a Twilio telephony configuration to this agent (or set the agent's Vapi phone number id manually)."
    );
  }

  const number = config.phoneNumber || agent.callerIdNumber || agent.connectedPhoneNumber;
  const id = await ensureVapiPhoneNumber({
    number,
    twilioAccountSid: config.accountSid,
    twilioAuthToken: decryptSecret(config.authToken),
    name: agent.agentName || config.name
  });

  agent.vapiPhoneNumberId = id;
  await Agent.updateOne({ _id: agent._id }, { $set: { vapiPhoneNumberId: id } });
  console.log("[Vapi phone number provisioned]", { localAgentId: agent._id.toString(), number, vapiPhoneNumberId: id });
}

// Layer C seam: place an outbound call for a non-Dograh provider (e.g. Vapi) via the provider
// abstraction. Writes a CallLog with providerCallId at call start so the provider webhook
// (controllers/vapiWebhook.controller.js) can correlate the end-of-call report back to this log.
// Keeps the same billing reservation + return shape as the Dograh path.
async function triggerProviderOutboundCall({ agent, userId, phoneNumber, leadId, source, metadata }) {
  if (!phoneNumber) {
    throw new ApiError(400, "phoneNumber is required before triggering a call.");
  }
  assertE164(phoneNumber, "Phone number");

  // Create the assistant on-demand if it does not exist yet (surfaces the real create error).
  await ensureProviderAssistant(agent);

  // Auto-provision the Vapi phone-number id (imports the Twilio number into Vapi if needed).
  await ensureVapiPhoneNumberId(agent);

  const effectiveUserId = userId || agent.userId;
  const effectiveSource = source && source !== "dograh" ? source : agent.provider;

  // Credit gating (Phase 1): reserve estimated per-minute cost before placing the call.
  const billing = await reserveVoiceCallBilling({ userId: effectiveUserId, agent });
  if (billing.blocked) {
    throw new ApiError(402, billing.message || "Insufficient platform credits to place this call.", {
      code: "INSUFFICIENT_CREDITS"
    });
  }

  let providerResult;
  try {
    providerResult = await getProvider(agent.provider).startCall(agent, { phoneNumber, metadata });
  } catch (error) {
    // The call never started — return the held credits.
    if (billing.enforced) await releaseVoiceReservation(billing.billingCallId);
    throw error;
  }

  const providerCallId = providerResult?.providerCallId ? String(providerResult.providerCallId) : null;
  const rawProviderStatus = "initiated";

  console.log("[Provider call triggered]", {
    localAgentId: agent._id.toString(),
    provider: agent.provider,
    providerCallId,
    callerNumber: phoneNumber
  });

  const callLog = await CallLog.create({
    userId: effectiveUserId,
    agentId: agent._id,
    providerCallId,
    leadId,
    campaignId: metadata.campaignId,
    campaignRecipientId: metadata.campaignRecipientId,
    callerNumber: phoneNumber,
    callingNumber: agent.callerIdNumber,
    status: rawProviderStatus,
    rawProviderStatus,
    providerPayload: providerResult?.raw || providerResult,
    callDirection: "outbound",
    source: effectiveSource,
    duration: null,
    durationSeconds: null,
    summary: null,
    transcript: null,
    startedAt: new Date(),
    billingEnforced: Boolean(billing.enforced),
    billingMode: billing.enforced ? billing.billingMode : null,
    billingCallId: billing.enforced ? billing.billingCallId : null
  });
  await applyCallOutcomeToLog(callLog, rawProviderStatus);
  await callLog.save();

  return {
    dograhResponse: { status: rawProviderStatus, providerCallId },
    callLog,
    publicCallLog: publicCallLog(callLog)
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
  // Non-Dograh agents (e.g. Vapi) are placed through the provider abstraction. If a legacy
  // record still says "vapi" while carrying Dograh workflow ids, prefer the Dograh runtime.
  if (agent?.provider && agent.provider !== "dograh" && !hasDograhRuntime(agent)) {
    return triggerProviderOutboundCall({ agent, userId, phoneNumber, leadId, source, metadata });
  }

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

  let voiceRuntime;
  try {
    voiceRuntime = await assertDograhVoiceReadyForWebCall({ agent, userId: userId || agent.userId });
  } catch (error) {
    throw new ApiError(400, error.safeMessage || error.message || "The selected voice provider is not verified with Dograh yet.", {
      code: "DOGRAH_VOICE_NOT_VERIFIED",
      configurationRequired: true,
      voiceRuntime: error.runtime || null
    });
  }
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
    allowStoredRuntimeFallback: false,
    callType: "outbound_phone_call",
    fetchWorkflow: async () => {
      try {
        const response = await resolved.client.get(`/workflow/fetch/${encodeURIComponent(workflowId)}`);
        return response.data;
      } catch (error) {
        if (error?.response?.status === 404) {
          throw new ApiError(404, "Dograh workflow was not found for this agent. Re-sync the agent workflow, then retry the call.", {
            code: "DOGRAH_WORKFLOW_NOT_FOUND"
          });
        }
        throw error;
      }
    }
  });
  assertRuntimeVerification(runtimeVerification);

  // Credit gating (Phase 1): reserve estimated per-minute cost before placing the call. Blocks
  // here (no Dograh call made) if the wallet can't cover it. No-op unless CREDIT_ENFORCEMENT=true.
  const billing = await reserveVoiceCallBilling({ userId: userId || agent.userId, agent });
  if (billing.blocked) {
    throw new ApiError(402, billing.message || "Insufficient platform credits to place this call.", {
      code: "INSUFFICIENT_CREDITS"
    });
  }

  const payload = dograhCallPayload(agent, phoneNumber, metadata);
  let dograhResponse;
  try {
    dograhResponse = await trigger(agent.dograhWorkflowUuid, payload, { userId: userId || agent.userId, agent });
  } catch (error) {
    // The call never started — return the held credits.
    if (billing.enforced) await releaseVoiceReservation(billing.billingCallId);
    throw error;
  }
  const dograhRunId = extractRunId(dograhResponse);
  const responseFields = extractCallFields(dograhResponse);
  const rawProviderStatus = dograhResponse?.status || dograhResponse?.data?.status || "initiated";

  console.log("Dograh trigger accepted:", {
    localAgentId: agent._id.toString(),
    workflowId,
    workflowUuid: agent.dograhWorkflowUuid,
    dograhRunId: dograhRunId ? String(dograhRunId) : null,
    rawProviderStatus
  });
  if (isPipelineErrorStatus(rawProviderStatus)) {
    if (billing.enforced) await releaseVoiceReservation(billing.billingCallId);
    throw new ApiError(400, "Dograh could not start the outbound call pipeline. Re-sync the agent runtime, then retry the call.", {
      code: "DOGRAH_PIPELINE_ERROR",
      workflowId,
      workflowUuid: agent.dograhWorkflowUuid,
      dograhRunId: dograhRunId ? String(dograhRunId) : null
    });
  }
  if (!dograhRunId) {
    console.warn("Dograh run ID missing in trigger response. CallLog will be created, but manual sync needs a run ID.");
  }

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
    billingEnforced: Boolean(billing.enforced),
    billingMode: billing.enforced ? billing.billingMode : null,
    billingCallId: billing.enforced ? billing.billingCallId : null,
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
