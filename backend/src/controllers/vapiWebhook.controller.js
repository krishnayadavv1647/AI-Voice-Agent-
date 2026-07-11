import crypto from "crypto";
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
import { transferNumberForAgent } from "../utils/phone.js";

// Real wiring. Tests pass fakes for the same keys so the side-effect chain runs without a DB.
// Built lazily (at call time, NOT module-load time): this controller sits in a circular-import web
// (campaign.service -> outboundCall.service -> providers -> ...), and on some entry orders the model
// bindings are still `undefined` while this module initializes. Snapshotting them into an object at
// load time would capture `undefined` permanently. Referencing them at request time is safe because
// ESM live bindings are fully resolved by then.
function getDefaultDeps() {
  return {
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
}

// Circular imports (see getDefaultDeps) can leave an imported model binding `undefined` at call
// time. Prefer an explicitly injected dep (tests), else pull the live model from mongoose's
// registry — which is fully populated by request time — and tolerate it being absent.
function resolveModel(deps, name) {
  if (deps?.[name]) return deps[name];
  try { return mongoose.model(name); } catch { return undefined; }
}

async function findAgent(fields, deps) {
  const AgentModel = resolveModel(deps, "Agent");
  if (!AgentModel) {
    console.error("[Vapi webhook] model unavailable", { model: "Agent", event: "end-of-call-report" });
    return null;
  }

  if (fields.localAgentId && mongoose.Types.ObjectId.isValid(fields.localAgentId)) {
    const agent = await AgentModel.findById(fields.localAgentId);
    if (agent) return agent;
  }

  // Correlate Vapi webhook calls by the stored assistant id.
  if (fields.providerAgentId) {
    const agent = await AgentModel.findOne({ providerAgentId: fields.providerAgentId });
    if (agent) return agent;
  }

  return null;
}

async function upsertLead({ agent, callLog, leadData }, deps) {
  if (!hasUsefulLeadData(leadData)) return false;

  const LeadModel = resolveModel(deps, "Lead");
  if (!LeadModel) {
    console.error("[Vapi webhook] model unavailable", { model: "Lead", event: "end-of-call-report" });
    return false;
  }

  const existingLead = await LeadModel.findOne({ callLogId: callLog._id });
  if (existingLead) return false;

  await LeadModel.create(deps.normalizeLeadToEnglish({
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

function compactUpdate(update) {
  return Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
}

// Handles a Vapi end-of-call-report and returns a small result object
// describing what happened (used by tests and logging).
export async function processVapiEndOfCall(message, deps = getDefaultDeps()) {
  const CallLogModel = resolveModel(deps, "CallLog");
  const WebhookEventModel = resolveModel(deps, "WebhookEvent");
  if (!CallLogModel || !WebhookEventModel) {
    console.error("[Vapi webhook] model unavailable", {
      model: !CallLogModel ? "CallLog" : "WebhookEvent",
      event: message?.type
    });
    return { matched: false };
  }

  const fields = extractVapiCallFields(message);
  const agent = await findAgent(fields, deps);

  if (!agent) {
    await WebhookEventModel.create({
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

  // Match ladder: providerCallId first (stable Vapi id), then caller-number fallbacks.
  const matchQueries = [
    fields.providerCallId ? { agentId: agent._id, providerCallId: fields.providerCallId } : null,
    fields.providerCallId ? { providerCallId: fields.providerCallId } : null,
    fields.callerNumber ? { agentId: agent._id, callerNumber: fields.callerNumber, status: "initiated" } : null,
    fields.callerNumber ? { agentId: agent._id, callerNumber: fields.callerNumber } : null
  ].filter(Boolean);

  let callLog = null;
  for (const query of matchQueries) {
    callLog = await CallLogModel.findOne(query).sort({ createdAt: -1 });
    if (callLog) break;
  }

  if (callLog) {
    Object.assign(callLog, update);
    await callLog.save();
  } else {
    callLog = await CallLogModel.create(update);
  }

  const leadCreated = await upsertLead({ agent, callLog, leadData }, deps);
  await deps.applyCallOutcomeToLog(callLog, rawProviderStatus, { endedAt: fields.endedAt });
  await callLog.save();
  await deps.syncCampaignRecipientFromCall(callLog);
  await deps.scheduleRetryFollowUpForCall(callLog);
  await WebhookEventModel.create({
    provider: "vapi",
    eventType: fields.endedReason || message.type,
    payload: message,
    matchedAgentId: agent._id,
    matchedCallLogId: callLog._id
  });

  agent.totalCalls = await CallLogModel.countDocuments({ agentId: agent._id });
  if (leadCreated) agent.totalLeads += 1;

  const durationSeconds = fields.durationSeconds || 0;
  const UserModel = resolveModel(deps, "User");
  await Promise.all([
    agent.save(),
    durationSeconds > 0 && UserModel
      ? UserModel.findByIdAndUpdate(agent.userId, { $inc: { minutesUsed: Math.ceil(durationSeconds / 60) } })
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
export async function applyVapiStatusUpdate(message, deps = getDefaultDeps()) {
  const fields = extractVapiCallFields(message);
  if (!fields.providerCallId || !message.status) return;

  const CallLogModel = resolveModel(deps, "CallLog");
  if (!CallLogModel) {
    console.error("[Vapi webhook] model unavailable", { model: "CallLog", event: message?.type });
    return;
  }

  await CallLogModel.updateOne(
    { providerCallId: fields.providerCallId },
    { $set: { rawProviderStatus: String(message.status) } }
  );
}

// Constant-time secret comparison. A length mismatch is treated as failure (timingSafeEqual
// throws on unequal-length buffers), so an attacker can't learn the length via timing.
function secretsMatch(provided, expected) {
  const a = Buffer.from(String(provided ?? ""));
  const b = Buffer.from(String(expected ?? ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// POST /api/vapi/webhook
export async function vapiWebhook(req, res, deps = getDefaultDeps()) {
  const message = req.body?.message || req.body || {};

  // Signature verification: Vapi echoes server.secret as the x-vapi-secret header.
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET?.trim();

  // In production an unset secret means anyone could POST forged end-of-call events (which trigger
  // lead creation + billing settlement). Refuse to process unverified webhooks there.
  if (process.env.NODE_ENV === "production" && !expectedSecret) {
    console.error("[Vapi webhook] rejected: VAPI_WEBHOOK_SECRET not configured");
    return res.status(401).json({ success: false, error: "webhook secret not configured" });
  }

  if (expectedSecret && !secretsMatch(req.headers["x-vapi-secret"], expectedSecret)) {
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

      case "transfer-destination-request": {
        // The assistant called transferCall with NO destination (destinations: [] on the tool), so
        // Vapi asks us where to send the caller. We resolve the owning agent and supply its own
        // contactNumber (E.164) with a warm-transfer-with-summary plan. Fail-safe: any problem ->
        // respond { error } and the call continues (never crash, never dead-air).
        try {
          // Log the raw envelope once so the assistant-id field + shape can be confirmed on the
          // first live transfer (wire-format spike).
          console.log("[Vapi webhook] transfer-destination-request payload", JSON.stringify({
            callId: message.call?.id,
            assistantId: message.call?.assistantId,
            assistantNestedId: message.call?.assistant?.id,
            topAssistantId: message.assistant?.id || message.assistantId
          }));

          const assistantId =
            message.call?.assistantId ||
            message.call?.assistant?.id ||
            message.assistant?.id ||
            message.assistantId;
          const agent = assistantId
            ? await deps.Agent.findOne({ providerAgentId: assistantId })
            : null;
          const number = transferNumberForAgent(agent);

          if (!number) {
            console.warn("[Vapi webhook] transfer-destination-request: no valid contactNumber", { assistantId });
            return res.status(200).json({
              error:
                (agent?.humanTransferMessage && agent.humanTransferMessage.trim()) ||
                "Sorry, I can't connect you right now. Our team will call you back shortly."
            });
          }

          return res.status(200).json({
            destination: {
              type: "number",
              number, // agent.contactNumber, normalized to E.164
              numberE164CheckEnabled: true,
              message: "Please hold while I connect you to a team member.",
              transferPlan: {
                mode: "warm-transfer-with-summary",
                summaryPlan: {
                  enabled: true,
                  messages: [
                    { role: "system", content: "Provide a brief summary of this call for the human agent about to take over." },
                    { role: "user", content: "Here is the transcript:\n\n{{transcript}}\n\n" }
                  ]
                }
              }
            }
          });
        } catch (error) {
          console.error("[Vapi webhook] transfer-destination-request failed:", error.message);
          return res.status(200).json({ error: "Transfer is unavailable right now." });
        }
      }

      case "assistant-request": {
        // Inbound dynamic routing. One-time setup: import the Twilio number into Vapi (SID/token),
        // set VAPI_PHONE_NUMBER_ID, and either attach an assistant statically OR rely on this handler.
        // Here we map the dialed Vapi number -> the owning agent's assistant. Falls back to {} so Vapi
        // uses whatever assistant is statically attached if we can't resolve one.
        try {
          const phoneNumberId = message.phoneNumberId || message.phoneNumber?.id || message.call?.phoneNumberId;
          if (phoneNumberId) {
            const agent = await deps.Agent.findOne({ vapiPhoneNumberId: phoneNumberId });
            if (agent?.providerAgentId) {
              return res.status(200).json({ assistantId: agent.providerAgentId });
            }
          }
        } catch (error) {
          console.error("[Vapi webhook] assistant-request routing failed:", error.message);
        }
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
    // Always 200 so Vapi does not hammer retries. The error detail is
    // included for diagnostics; it is safe (no secrets) and does not affect Vapi's handling.
    return res.status(200).json({
      success: true,
      warning: "Webhook received but processing failed",
      error: String(error?.message || error).slice(0, 300)
    });
  }
}
