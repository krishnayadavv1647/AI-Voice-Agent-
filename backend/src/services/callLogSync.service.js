import Agent from "../models/Agent.js";
import { applyCallOutcomeToLog, scheduleRetryFollowUpForCall } from "./callOutcome.service.js";
import { hasUsefulLeadData, normalizeDograhRunDetails } from "./callLogMapper.js";
import { getDograhCallRunDetails } from "./dograh.service.js";
import { autoCreateAppointmentFromCall, autoGenerateLeadFromCall, upsertLeadFromCallData } from "./leadGeneration.service.js";

function compactUpdate(update) {
  return Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
}

// This is the SAME unguarded sync logic the manual "Sync" button uses. Unlike
// syncDograhCallStatus(), it always re-fetches from Dograh even for terminal-status
// calls — which is required because Dograh often finalizes the call status before
// the transcript is ready, so a terminal call may still need its transcript pulled.
export async function applyRunDetailsToCallLog(callLog, runDetails) {
  const mapped = normalizeDograhRunDetails(runDetails);
  console.log("Mapped Dograh run details:", mapped);
  console.log("Dograh gathered_context:", runDetails?.gathered_context || runDetails?.data?.gathered_context || runDetails?.data?.run?.gathered_context);
  console.log("Dograh analysis:", runDetails?.analysis || runDetails?.data?.analysis || runDetails?.data?.run?.analysis);
  console.log("Dograh extracted leadData:", mapped.leadData);
  console.log("Dograh realtime events:", (runDetails?.logs?.realtime_feedback_events || runDetails?.data?.logs?.realtime_feedback_events || runDetails?.data?.run?.logs?.realtime_feedback_events)?.map((event) => event.type));

  const leadData = mapped.leadData || null;

  const rawProviderStatus = mapped.status || callLog.status;
  Object.assign(callLog, compactUpdate({
    status: rawProviderStatus,
    rawProviderStatus,
    providerPayload: runDetails,
    durationSeconds: mapped.durationSeconds ?? callLog.durationSeconds,
    duration: mapped.duration || callLog.duration,
    startedAt: mapped.startedAt ? new Date(mapped.startedAt) : callLog.startedAt,
    endedAt: mapped.endedAt ? new Date(mapped.endedAt) : callLog.endedAt,
    callEndedAt: mapped.endedAt ? new Date(mapped.endedAt) : callLog.callEndedAt,
    transcript: mapped.transcript
      ? typeof mapped.transcript === "object" ? JSON.stringify(mapped.transcript, null, 2) : mapped.transcript
      : callLog.transcript,
    transcriptUrl: mapped.transcriptUrl || callLog.transcriptUrl,
    recordingUrl: mapped.recordingUrl || callLog.recordingUrl,
    summary: mapped.summary || callLog.summary,
    rawRunDetails: runDetails
  }));

  await applyCallOutcomeToLog(callLog, rawProviderStatus, { endedAt: callLog.endedAt });
  await callLog.save();
  console.log("Updated CallLog:", callLog._id);

  const leadResult = await upsertLeadFromCallData(callLog, leadData);

  if (leadResult) {
    callLog.leadCaptured = true;
    callLog.leadData = leadData;
    callLog.leadId = leadResult.lead._id;
    await callLog.save();
    await autoCreateAppointmentFromCall(callLog, leadResult.lead);
  }

  if (leadResult?.created && callLog.agentId) {
    await Agent.findByIdAndUpdate(callLog.agentId, { $inc: { totalLeads: 1 } });
  }

  if (!leadResult) {
    await autoGenerateLeadFromCall(callLog);
  }

  await scheduleRetryFollowUpForCall(callLog);

  return callLog;
}

export async function syncCallLogWithDograhRun({ callLog, workflowId, runId }) {
  try {
    const agent = callLog.agentId ? await Agent.findById(callLog.agentId) : null;
    const runDetails = await getDograhCallRunDetails(workflowId, runId, { userId: callLog.userId, agent });
    return applyRunDetailsToCallLog(callLog, runDetails);
  } catch (error) {
    console.log("Dograh run sync failed:", { status: error.response?.status, message: error.message });
    throw error;
  }
}

// Resolves the workflow id (from the call log, or its agent) and runs the manual-sync
// logic above. Used by the auto-pipeline so its behavior matches the manual Sync button.
export async function syncCallLogFromDograh(callLog) {
  let workflowId = callLog.dograhWorkflowId;
  if (!workflowId && callLog.agentId) {
    const agent = await Agent.findById(callLog.agentId);
    workflowId = agent?.dograhWorkflowId || agent?.providerWorkflowId || "";
    if (workflowId) {
      callLog.dograhWorkflowId = workflowId;
      await callLog.save();
    }
  }

  if (!workflowId) throw new Error("Dograh workflow ID is missing for this call log.");
  if (!callLog.dograhRunId) throw new Error("Dograh run ID is missing for this call log.");

  return syncCallLogWithDograhRun({ callLog, workflowId, runId: callLog.dograhRunId });
}
