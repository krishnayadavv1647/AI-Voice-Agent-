import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import TelephonyConfig from "../models/TelephonyConfig.js";
import { decryptSecret } from "../utils/secretCrypto.js";
import { ensureVapiPhoneNumber } from "./vapi.service.js";
import { applyCallOutcomeToLog } from "./callOutcome.service.js";
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

function firstSpokenMessage(agent) {
  const message = [agent?.firstMessage, agent?.greetingMessage]
    .find((item) => item && String(item).trim());

  return String(message || `Hello, welcome to ${agent?.businessName || "our business"}. How can I help you today?`).trim();
}

function publicCallLog(callLog) {
  const value = callLog?.toObject ? callLog.toObject() : { ...(callLog || {}) };
  delete value.providerPayload;
  delete value.rawWebhookPayload;
  return value;
}

// Lazily create the provider assistant if it is missing, so agents created before auto-wiring
// (or whose create was swallowed) can still place a call. Persists providerAgentId so the webhook
// and future calls can correlate. Surfaces the real create error (e.g. missing VAPI_PRIVATE_KEY)
// instead of the generic "assistant is not created yet" from startCall.
async function ensureProviderAssistant(agent) {
  if (agent.providerAgentId) return;

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

// Outbound calls go through the provider abstraction (Vapi is the live path). Signature,
// billing reserve/release, applyCallOutcomeToLog, and the { callLog, publicCallLog, providerResponse }
// return shape are preserved because the callers depend on them.
export async function triggerOutboundCallForAgent({
  agent,
  userId,
  phoneNumber,
  leadId,
  source = "vapi",
  metadata = {}
}) {
  if (!phoneNumber) throw new ApiError(400, "phoneNumber is required before placing a call.");
  assertE164(phoneNumber, "Phone number");

  // Self-heal: create the assistant + import the Vapi phone number if they do not exist yet.
  await ensureProviderAssistant(agent);
  await ensureVapiPhoneNumberId(agent);

  if (!agent?.providerAgentId) {
    throw new ApiError(400, "This agent has not finished syncing to the calling provider yet. Save the agent and retry once it is synced.");
  }

  const effectiveUserId = userId || agent.userId;

  // Credit gating — UNCHANGED behavior. Reserve before placing the call.
  const billing = await reserveVoiceCallBilling({ userId: effectiveUserId, agent });
  if (billing.blocked) {
    throw new ApiError(402, billing.message || "Insufficient platform credits to place this call.", { code: "INSUFFICIENT_CREDITS" });
  }

  const provider = getProvider(agent.provider || "vapi");
  let providerResult;
  try {
    providerResult = await provider.startCall(agent, {
      phoneNumber,
      metadata: {
        localAgentId: agent._id.toString(),
        userId: effectiveUserId.toString(),
        leadId: leadId ? String(leadId) : undefined,
        campaignId: metadata.campaignId ? String(metadata.campaignId) : undefined,
        campaignRecipientId: metadata.campaignRecipientId ? String(metadata.campaignRecipientId) : undefined,
        firstMessage: firstSpokenMessage(agent),
        ...metadata
      }
    });
  } catch (error) {
    // The call never started — return the held credits.
    if (billing.enforced) await releaseVoiceReservation(billing.billingCallId);
    throw error;
  }

  const providerCallId = providerResult?.providerCallId ? String(providerResult.providerCallId) : null;
  // "initiated" is the status the webhook match ladder falls back to; applyCallOutcomeToLog maps it
  // to in_progress. The provider's transient "call_started" is not a meaningful outcome status.
  const rawProviderStatus = "initiated";

  if (!providerCallId) {
    console.warn("[Outbound] Provider returned no call id; webhook will fall back to callerNumber matching.");
  }

  const callLog = await CallLog.create({
    userId: effectiveUserId,
    agentId: agent._id,
    provider: agent.provider || "vapi",
    providerCallId,                       // lets the Vapi webhook match precisely
    leadId,
    campaignId: metadata.campaignId,
    campaignRecipientId: metadata.campaignRecipientId,
    callerNumber: phoneNumber,
    callingNumber: agent.callerIdNumber || null,
    status: rawProviderStatus,
    rawProviderStatus,
    providerPayload: providerResult?.raw || providerResult || null,
    callDirection: "outbound",
    source,
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

  console.log("[Outbound] Vapi call placed:", {
    localAgentId: agent._id.toString(),
    assistantId: agent.providerAgentId,
    providerCallId,
    callerNumber: phoneNumber
  });

  const providerResponse = { status: rawProviderStatus, providerCallId };
  return {
    providerResponse,
    callLog,
    publicCallLog: publicCallLog(callLog)
  };
}
