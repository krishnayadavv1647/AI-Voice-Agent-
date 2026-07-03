import mongoose from "mongoose";
import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import User from "../models/User.js";
import WebhookEvent from "../models/WebhookEvent.js";
import { applyCallOutcomeToLog, scheduleRetryFollowUpForCall } from "../services/callOutcome.service.js";
import { syncCampaignRecipientFromCall } from "../services/campaign.service.js";
import { extractVapiCallFields, hasUsefulLeadData, normalizeVapiLeadData, pick } from "../services/callLogMapper.js";
import { normalizeLeadToEnglish } from "../services/leadEnglishNormalizer.js";
import { autoGenerateLeadFromCall } from "../services/leadGeneration.service.js";
import { settleVoiceCallBilling } from "../services/billing/voiceCallBilling.service.js";

// Real wiring. Tests pass fakes for the same keys so the side-effect chain runs without a DB.
const defaultDeps = {
  Agent,
  CallLog,
  Lead,
  User,
  WebhookEvent,
  applyCallOutcomeToLog,
  scheduleRetryFollowUpForCall,
  syncCampaignRecipientFromCall,
  settleVoiceCallBilling,
  autoGenerateLeadFromCall,
  normalizeLeadToEnglish
};

async function findAgent(fields, deps) {
  const { Agent: AgentModel } = deps;

  if (fields.localAgentId && mongoose.Types.ObjectId.isValid(fields.localAgentId)) {
    const agent = await AgentModel.findById(fields.localAgentId);
    if (agent) return agent;
  }

  // Vapi has no dograhWorkflowUuid; correlate by the stored assistant id instead.
  if (fields.providerAgentId) {
    const agent = await AgentModel.findOne({ providerAgentId: fields.providerAgentId });
    if (agent) return agent;
  }

  return null;
}

// duplicated from webhook.controller.js (kept local to avoid editing the Dograh file in Layer B).
async function upsertLead({ agent, callLog, leadData }, deps) {
  if (!hasUsefulLeadData(leadData)) return false;

  const existingLead = await deps.Lead.findOne({ callLogId: callLog._id });
  if (existingLead) return false;

  await deps.Lead.create(deps.normalizeLeadToEnglish({
    userId: agent.userId,
    agentId: agent._id,
    callLogId: callLog._id,
    name: leadData.name,
    phone: leadData.phone,
    email: leadData.email,
    requirement: leadData.requirement,
    preferredDate: leadData.preferredDate,
    preferredTime: leadData.preferredTime,
    budget: leadData.budget,
    location: leadData.location,
    message: leadData.message,
    customFields: leadData.customFields,
    status: "New",
    source: "call"
  }));

  return true;
}

// duplicated from webhook.controller.js.
function compactUpdate(update) {
  return Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
}

// Mirrors dograhWebhook steps 3-9 for a Vapi end-of-call-report. Returns a small result object
// describing what happened (used by tests and logging).
export async function processVapiEndOfCall(message, deps = defaultDeps) {
  const fields = extractVapiCallFields(message);
  const agent = await findAgent(fields, deps);

  if (!agent) {
    await deps.WebhookEvent.create({
      provider: "vapi",
      eventType: pick(fields.endedReason, message.type, "unmatched"),
      payload: message
    });
    return { matched: false };
  }

  const leadData = normalizeVapiLeadData(message);
  const leadCaptured = hasUsefulLeadData(leadData);
  const rawProviderStatus = fields.status || "completed";

  const update = compactUpdate({
    userId: agent.userId,
    agentId: agent._id,
    providerCallId: fields.providerCallId,
    callerNumber: fields.callerNumber,
    callingNumber: fields.callingNumber,
    status: rawProviderStatus,
    rawProviderStatus,
    providerPayload: message,
    callDirection: fields.callDirection || "outbound",
    source: "vapi",
    duration: fields.duration,
    durationSeconds: fields.durationSeconds,
    transcript: fields.transcript,
    summary: fields.summary,
    recordingUrl: fields.recordingUrl,
    transcriptUrl: fields.transcriptUrl,
    leadCaptured,
    leadData: leadCaptured ? leadData : undefined,
    rawWebhookPayload: message,
    startedAt: fields.startedAt,
    endedAt: fields.endedAt,
    callEndedAt: fields.endedAt
  });

  // Match ladder: providerCallId first (stable Vapi id), then caller-number fallbacks. Mirrors the
  // Dograh ladder with providerCallId swapped in for dograhRunId.
  const matchQueries = [
    fields.providerCallId ? { agentId: agent._id, providerCallId: fields.providerCallId } : null,
    fields.providerCallId ? { providerCallId: fields.providerCallId } : null,
    fields.callerNumber ? { agentId: agent._id, callerNumber: fields.callerNumber, status: "initiated" } : null,
    fields.callerNumber ? { agentId: agent._id, callerNumber: fields.callerNumber } : null
  ].filter(Boolean);

  let callLog = null;
  for (const query of matchQueries) {
    callLog = await deps.CallLog.findOne(query).sort({ createdAt: -1 });
    if (callLog) break;
  }

  if (callLog) {
    Object.assign(callLog, update);
    await callLog.save();
  } else {
    callLog = await deps.CallLog.create(update);
  }

  const leadCreated = await upsertLead({ agent, callLog, leadData }, deps);
  await deps.applyCallOutcomeToLog(callLog, rawProviderStatus, { endedAt: fields.endedAt });
  await callLog.save();
  await deps.syncCampaignRecipientFromCall(callLog);
  await deps.scheduleRetryFollowUpForCall(callLog);
  await deps.WebhookEvent.create({
    provider: "vapi",
    eventType: fields.endedReason || message.type,
    payload: message,
    matchedAgentId: agent._id,
    matchedCallLogId: callLog._id
  });

  agent.totalCalls = await deps.CallLog.countDocuments({ agentId: agent._id });
  if (leadCreated) agent.totalLeads += 1;

  const durationSeconds = fields.durationSeconds || 0;
  await Promise.all([
    agent.save(),
    durationSeconds > 0
      ? deps.User.findByIdAndUpdate(agent.userId, { $inc: { minutesUsed: Math.ceil(durationSeconds / 60) } })
      : Promise.resolve()
  ]);

  // Settle per-minute credit billing against the final duration/outcome (idempotent).
  await deps.settleVoiceCallBilling(callLog);

  // If Vapi did not hand us structured lead data, auto-generate the lead from the transcript.
  if (!leadCreated) {
    await deps.autoGenerateLeadFromCall(callLog);
  }

  return { matched: true, callLog, agent, leadCreated };
}

// Lightweight status touch for interim status-update events; best-effort, never throws.
async function applyVapiStatusUpdate(message, deps) {
  const fields = extractVapiCallFields(message);
  if (!fields.providerCallId || !message.status) return;

  await deps.CallLog.updateOne(
    { providerCallId: fields.providerCallId },
    { $set: { rawProviderStatus: String(message.status) } }
  );
}

// POST /api/vapi/webhook
export async function vapiWebhook(req, res, deps = defaultDeps) {
  const message = req.body?.message || req.body || {};

  // Optional signature verification: Vapi echoes server.secret as the x-vapi-secret header.
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET?.trim();
  if (expectedSecret && req.headers["x-vapi-secret"] !== expectedSecret) {
    console.warn("[Vapi webhook] rejected: x-vapi-secret mismatch");
    return res.status(401).json({ success: false, error: "invalid signature" });
  }

  console.log("[Vapi webhook] received:", message.type);

  try {
    switch (message.type) {
      case "end-of-call-report": {
        const result = await processVapiEndOfCall(message, deps);
        if (!result.matched) {
          return res.status(200).json({ success: true, warning: "Webhook received but no matching agent found" });
        }
        console.log("[Vapi webhook] CallLog updated:", result.callLog._id);
        return res.status(200).json({ success: true });
      }

      case "status-update": {
        await applyVapiStatusUpdate(message, deps);
        return res.status(200).json({ success: true });
      }

      case "assistant-request": {
        // TODO Layer C: inbound dynamic assistant routing. Out of scope for Layer B.
        return res.status(200).json({});
      }

      default: {
        await deps.WebhookEvent.create({
          provider: "vapi",
          eventType: message.type || "unknown",
          payload: message
        });
        return res.status(200).json({ success: true });
      }
    }
  } catch (error) {
    console.error("[Vapi webhook] processing failed:", error);
    // Always 200 so Vapi does not hammer retries (matches the Dograh handler). The error detail is
    // included for diagnostics; it is safe (no secrets) and does not affect Vapi's handling.
    return res.status(200).json({
      success: true,
      warning: "Webhook received but processing failed",
      error: String(error?.message || error).slice(0, 300)
    });
  }
}
