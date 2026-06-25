import Appointment from "../models/Appointment.js";
import CallLog from "../models/CallLog.js";
import FollowUp from "../models/FollowUp.js";
import Lead from "../models/Lead.js";

const RETRY_OUTCOMES = new Set(["declined", "no_answer", "busy", "failed"]);
const SUCCESS_OUTCOMES = new Set(["completed", "answered", "cancelled"]);
const MAX_RETRY_ATTEMPTS = 3;

export function normalizeCallOutcome(rawStatus) {
  const status = String(rawStatus || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (["completed", "complete", "done", "ended", "success"].includes(status)) return "completed";
  if (["answered", "answer", "connected"].includes(status)) return "answered";
  if (["rejected", "declined", "reject"].includes(status)) return "declined";
  if (["no-answer", "no_answer", "not_picked", "missed", "unanswered", "not_answered", "timeout"].includes(status)) return "no_answer";
  if (["busy", "line_busy"].includes(status)) return "busy";
  if (["failed", "failure", "error", "pipeline_error"].includes(status)) return "failed";
  if (["cancelled", "canceled", "user_hangup"].includes(status)) return "cancelled";
  if (["initiated", "ringing", "queued", "in_progress", "pending"].includes(status)) return "in_progress";

  return "unknown";
}

export function retryTriggerForOutcome(normalizedStatus) {
  if (normalizedStatus === "declined") return "call_declined";
  if (normalizedStatus === "no_answer") return "call_not_picked";
  if (normalizedStatus === "busy") return "call_busy";
  if (normalizedStatus === "failed") return "call_failed";
  return null;
}

export function retryDelayForOutcome(normalizedStatus) {
  if (process.env.FOLLOWUP_RETRY_TEST_MODE === "true") return 2 * 60 * 1000;
  if (normalizedStatus === "declined") return 24 * 60 * 60 * 1000;
  if (normalizedStatus === "no_answer") return 2 * 60 * 60 * 1000;
  if (normalizedStatus === "busy") return 30 * 60 * 1000;
  if (normalizedStatus === "failed") return 4 * 60 * 60 * 1000;
  return 0;
}

export function isRetryEligible(normalizedStatus) {
  if (RETRY_OUTCOMES.has(normalizedStatus)) return true;
  if (SUCCESS_OUTCOMES.has(normalizedStatus)) return false;
  return false;
}

export const normalizeDograhStatus = normalizeCallOutcome;

function noteText(status, scheduledAt) {
  return `Call ${status}. Retry scheduled for ${scheduledAt.toLocaleString()}.`;
}

async function findLeadForCall(callLog) {
  if (callLog.leadId) {
    const lead = await Lead.findOne({ _id: callLog.leadId, userId: callLog.userId });
    if (lead) return lead;
  }

  if (!callLog.callerNumber) return null;
  const existingLead = await Lead.findOne({
    userId: callLog.userId,
    agentId: callLog.agentId,
    phone: callLog.callerNumber
  }).sort({ createdAt: -1 });

  if (existingLead) return existingLead;

  return Lead.create({
    userId: callLog.userId,
    agentId: callLog.agentId,
    callLogId: callLog._id,
    name: callLog.callerNumber,
    phone: callLog.callerNumber,
    source: "call",
    status: "follow_up",
    notes: [{ text: "Lead created automatically from call retry outcome." }]
  });
}

export async function applyCallOutcomeToLog(callLog, rawStatus, { endedAt } = {}) {
  let normalizedStatus = normalizeCallOutcome(rawStatus);
  const hasEnded = Boolean(endedAt || callLog.endedAt || callLog.callEndedAt);
  if (hasEnded && normalizedStatus === "in_progress") {
    normalizedStatus = "completed";
  }
  const retryEligible = isRetryEligible(normalizedStatus);

  callLog.rawProviderStatus = rawStatus || callLog.rawProviderStatus || callLog.status;
  callLog.normalizedStatus = normalizedStatus;
  callLog.outcome = normalizedStatus;
  callLog.retryEligible = retryEligible;
  if (hasEnded || retryEligible || SUCCESS_OUTCOMES.has(normalizedStatus)) {
    callLog.callEndedAt = endedAt || callLog.endedAt || new Date();
  }

  console.log("[Call Outcome] raw status received:", rawStatus);
  console.log("[Call Outcome] normalized status:", normalizedStatus);
  console.log("[Call Outcome] retry eligible:", retryEligible);

  await syncAppointmentCallOutcome(callLog, normalizedStatus);

  return callLog;
}

async function syncAppointmentCallOutcome(callLog, normalizedStatus) {
  if (!callLog?._id || !callLog.userId) return null;

  const followUp = await FollowUp.findOne({
    userId: callLog.userId,
    callLogId: callLog._id,
    trigger: "appointment_call"
  });
  if (!followUp?.appointmentId) return null;

  const update = {};
  if (normalizedStatus === "in_progress") {
    update.appointmentCallStatus = "running";
  } else if (["completed", "answered"].includes(normalizedStatus)) {
    update.appointmentCallStatus = "completed";
    update.status = "completed";
    update.completedAt = callLog.callEndedAt || callLog.endedAt || new Date();
  } else if (["declined", "no_answer", "busy"].includes(normalizedStatus)) {
    update.appointmentCallStatus = "missed";
  } else if (normalizedStatus === "failed") {
    update.appointmentCallStatus = "failed";
  } else if (normalizedStatus === "cancelled") {
    update.appointmentCallStatus = "cancelled";
  }

  if (!Object.keys(update).length) return null;

  const appointment = await Appointment.findOneAndUpdate(
    { _id: followUp.appointmentId, userId: callLog.userId },
    { $set: update },
    { new: true }
  );

  if (appointment) {
    console.log("[Appointment Call] status synced from call outcome", {
      appointmentId: appointment._id.toString(),
      callLogId: callLog._id.toString(),
      appointmentCallStatus: appointment.appointmentCallStatus
    });
  }

  return appointment;
}

export async function scheduleRetryFollowUpForCall(callLog) {
  if (!callLog?.retryEligible || !callLog.userId || !callLog.agentId) return null;

  // pipeline_error means Dograh's voice/LLM pipeline couldn't start — a configuration
  // issue, not a call outcome. Retrying would loop forever until the agent is re-synced.
  if (callLog.rawProviderStatus === "pipeline_error") {
    console.log("[Call Outcome] retry skipped: pipeline_error requires agent re-sync, not retry", callLog._id?.toString());
    return null;
  }

  const trigger = retryTriggerForOutcome(callLog.normalizedStatus);
  if (!trigger) return null;

  const lead = await findLeadForCall(callLog);
  if (!lead) {
    console.log("[Call Outcome] retry skipped: no linked lead found", callLog._id.toString());
    return null;
  }

  if (!callLog.leadId) {
    callLog.leadId = lead._id;
  }

  const previousFailedAttempts = await CallLog.countDocuments({
    userId: callLog.userId,
    leadId: lead._id,
    _id: { $ne: callLog._id },
    normalizedStatus: { $in: Array.from(RETRY_OUTCOMES) }
  });
  const nextAttemptCount = previousFailedAttempts + 1;

  if (nextAttemptCount >= MAX_RETRY_ATTEMPTS) {
    lead.status = "unable_to_reach";
    lead.notes.push({ text: "Max retry attempts reached" });
    await lead.save();
    callLog.retryScheduled = false;
    await callLog.save();
    console.log("[Call Outcome] max attempts reached; lead marked unable_to_reach", lead._id.toString());
    return null;
  }

  const existing = await FollowUp.findOne({
    userId: callLog.userId,
    leadId: lead._id,
    callLogId: callLog._id,
    phoneNumber: callLog.callerNumber,
    trigger,
    status: { $in: ["scheduled", "running", "pending"] }
  });

  if (existing) {
    callLog.retryScheduled = true;
    await callLog.save();
    console.log("[Call Outcome] retry follow-up skipped: duplicate exists", existing._id.toString());
    return existing;
  }

  const scheduledAt = new Date(Date.now() + retryDelayForOutcome(callLog.normalizedStatus));
  const followUp = await FollowUp.create({
    userId: callLog.userId,
    agentId: callLog.agentId,
    leadId: lead._id,
    phoneNumber: callLog.callerNumber,
    callLogId: callLog._id,
    type: "call",
    trigger,
    status: "scheduled",
    scheduledAt,
    attemptCount: nextAttemptCount,
    maxAttempts: MAX_RETRY_ATTEMPTS,
    note: `Auto retry scheduled because call was ${callLog.normalizedStatus}`
  });

  lead.status = "follow_up";
  lead.notes.push({ text: noteText(callLog.normalizedStatus, scheduledAt) });
  await lead.save();

  callLog.retryScheduled = true;
  callLog.leadId = lead._id;
  await callLog.save();

  console.log("[Call Outcome] retry follow-up created", followUp._id.toString());
  return followUp;
}
