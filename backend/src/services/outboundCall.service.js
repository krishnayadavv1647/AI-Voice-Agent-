import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import TelephonyConfig from "../models/TelephonyConfig.js";
import { decryptSecret } from "../utils/secretCrypto.js";
import { ensureVapiPhoneNumber, getAssistant } from "./vapi.service.js";
import { applyCallOutcomeToLog } from "./callOutcome.service.js";
import { reserveVoiceCallBilling, releaseVoiceReservation } from "./billing/voiceCallBilling.service.js";
import { assertByokKeyUsableOrThrow } from "./apiKeyMode.service.js";
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

// When Vapi 404s a call, the stored providerAgentId is stale — the assistant was deleted, or created
// under a different VAPI_PRIVATE_KEY. VapiProvider.create no-ops while an id is present and
// VapiProvider.update PATCHes the missing id (also 404), so a stale id can never self-correct through
// the normal sync paths. Confirm the assistant is really gone, then clear the id, recreate it, and
// persist the fresh one. Returns true only when a new assistant id was provisioned.
async function recreateStaleProviderAssistant(agent) {
  if ((agent.provider || "vapi") !== "vapi") return false;

  const previousId = agent.providerAgentId;
  if (previousId) {
    const existing = await getAssistant(previousId).catch(() => null);
    if (existing) return false; // assistant still exists — the 404 was about something else
  }

  agent.providerAgentId = null;
  const created = await getProvider(agent.provider || "vapi").create(agent);
  const providerAgentId = created?.providerAgentId;
  if (!providerAgentId) {
    agent.providerAgentId = previousId;
    return false;
  }

  agent.providerAgentId = providerAgentId;
  agent.providerWorkflowId = created.providerWorkflowId || providerAgentId;
  await Agent.updateOne(
    { _id: agent._id },
    { $set: { providerAgentId, providerWorkflowId: agent.providerWorkflowId } }
  );
  console.log("[Outbound] Recreated stale Vapi assistant", {
    localAgentId: agent._id.toString(),
    previousProviderAgentId: previousId || null,
    providerAgentId
  });
  return true;
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

// The Vapi phone-number id goes stale the same way the assistant does (imported under a previous VAPI
// key/account). ensureVapiPhoneNumberId SKIPS re-resolution when a well-formed UUID is already stored,
// so a stale id would 404 on every /call forever. Clear it and re-resolve under the current key.
// Returns true only when a different id was provisioned.
async function refreshStaleVapiPhoneNumberId(agent) {
  if (agent.provider !== "vapi") return false;

  const previousId = agent.vapiPhoneNumberId;
  agent.vapiPhoneNumberId = null;
  try {
    await ensureVapiPhoneNumberId(agent);
  } catch (error) {
    agent.vapiPhoneNumberId = previousId;
    throw error;
  }

  const changed = Boolean(agent.vapiPhoneNumberId) && agent.vapiPhoneNumberId !== previousId;
  if (changed) {
    console.log("[Outbound] Refreshed stale Vapi phone number id", {
      localAgentId: agent._id.toString(),
      previousVapiPhoneNumberId: previousId || null,
      vapiPhoneNumberId: agent.vapiPhoneNumberId
    });
  }
  return changed;
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

  // -- STRICT BYOK PRE-FLIGHT (NO SILENT FALLBACK) --------------------------------
  // If the agent is in BYOK mode and its own LLM key is missing/invalid, this THROWS
  // here — before any credit reservation — so the call does not start and no platform
  // credits are consumed. Default System agents skip this and use platform keys + credits.
  await assertByokKeyUsableOrThrow(agent);
  // -------------------------------------------------------------------------------

  // Credit gating — UNCHANGED behavior. Reserve before placing the call.
  const billing = await reserveVoiceCallBilling({ userId: effectiveUserId, agent });
  if (billing.blocked) {
    throw new ApiError(402, billing.message || "Insufficient platform credits to place this call.", { code: "INSUFFICIENT_CREDITS" });
  }

  const provider = getProvider(agent.provider || "vapi");
  const startCallPayload = {
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
  };

  let providerResult;
  try {
    providerResult = await provider.startCall(agent, startCallPayload);
  } catch (error) {
    // Vapi 404s when agent.providerAgentId (assistant) or agent.vapiPhoneNumberId (imported number)
    // point at resources it no longer has — e.g. both were created under a previous VAPI key. Neither
    // self-corrects through the normal paths, so refresh whichever is stale and retry the call once.
    const status = error?.statusCode || error?.response?.status;
    let healed = null;
    if (status === 404 && (agent.provider || "vapi") === "vapi") {
      let assistantHealed = false;
      let phoneHealed = false;
      try { assistantHealed = await recreateStaleProviderAssistant(agent); } catch { assistantHealed = false; }
      try { phoneHealed = await refreshStaleVapiPhoneNumberId(agent); } catch { phoneHealed = false; }
      if (assistantHealed || phoneHealed) {
        try {
          healed = await provider.startCall(agent, startCallPayload);
        } catch {
          healed = null;
        }
      }
    }
    if (!healed) {
      // The call never started — return the held credits.
      if (billing.enforced) await releaseVoiceReservation(billing.billingCallId);
      throw error;
    }
    providerResult = healed;
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
