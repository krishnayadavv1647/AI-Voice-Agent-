import CallLog from "../models/CallLog.js";
import Agent from "../models/Agent.js";
import { applyCallOutcomeToLog, scheduleRetryFollowUpForCall } from "./callOutcome.service.js";
import { normalizeDograhRunDetails } from "./callLogMapper.js";
import { getDograhCallRunDetails } from "./dograh.service.js";

const FINAL_STATUSES = new Set(["completed", "answered", "declined", "no_answer", "busy", "failed", "cancelled"]);
const SYNC_DELAYS_MS = [30 * 1000, 90 * 1000, 180 * 1000];

function compactUpdate(update) {
  return Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
}

export async function syncDograhCallStatus(callLogId) {
  const callLog = await CallLog.findById(callLogId);
  if (!callLog) return null;
  if (!callLog.dograhWorkflowId || !callLog.dograhRunId) return callLog;
  if (FINAL_STATUSES.has(callLog.normalizedStatus)) return callLog;

  console.log("[Dograh Status Sync] fetching run status", {
    callLogId: callLog._id.toString(),
    workflowId: callLog.dograhWorkflowId,
    runId: callLog.dograhRunId
  });

  const agent = callLog.agentId ? await Agent.findById(callLog.agentId) : null;
  const runDetails = await getDograhCallRunDetails(callLog.dograhWorkflowId, callLog.dograhRunId, { userId: callLog.userId, agent });
  const mapped = normalizeDograhRunDetails(runDetails);
  const rawProviderStatus = mapped.status || callLog.rawProviderStatus || callLog.status;

  Object.assign(callLog, compactUpdate({
    status: rawProviderStatus || callLog.status,
    rawProviderStatus,
    providerPayload: runDetails,
    rawRunDetails: runDetails,
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
    summary: mapped.summary || callLog.summary
  }));

  await applyCallOutcomeToLog(callLog, rawProviderStatus, { endedAt: callLog.endedAt });
  await callLog.save();
  await scheduleRetryFollowUpForCall(callLog);
  return callLog;
}

export function scheduleDograhStatusSync(callLogId) {
  if (process.env.NODE_ENV === "test" || !callLogId) return;

  SYNC_DELAYS_MS.forEach((delay) => {
    setTimeout(() => {
      syncDograhCallStatus(callLogId).catch((error) => {
        console.error("[Dograh Status Sync] failed", {
          callLogId: String(callLogId),
          error: error.message
        });
      });
    }, delay);
  });
}
