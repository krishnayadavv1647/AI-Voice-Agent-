import axios from "axios";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import FollowUp from "../models/FollowUp.js";
import { runPipelinePass } from "../services/pipelineScheduler.js";
import { applyCallOutcomeToLog, isTerminalCallStatus, scheduleRetryFollowUpForCall } from "../services/callOutcome.service.js";
import { hasUsefulLeadData, normalizeDograhRunDetails } from "../services/callLogMapper.js";
import { getDograhCallRunDetails } from "../services/dograh.service.js";
import { runFollowUp } from "../services/followUp.service.js";
import { autoCreateAppointmentFromCall, autoGenerateLeadFromCall, extractLeadForCallLog, upsertLeadFromCallData } from "../services/leadGeneration.service.js";

function filter(req) {
  return ["admin", "super_admin"].includes(req.user.role) ? {} : { userId: req.user._id };
}

export const listCalls = asyncHandler(async (req, res) => {
  const calls = await CallLog.find(filter(req)).populate("agentId", "agentName").sort({ createdAt: -1 });
  res.json(calls);
  // Fire-and-forget: catch up any unsynced calls visible on this page load
  const scopedCallIds = calls
    .filter((c) => !isTerminalCallStatus(c.normalizedStatus))
    .map((c) => c._id);
  if (scopedCallIds.length) {
    runPipelinePass({ scopedCallIds }).catch(() => {});
  }
});

export const getCall = asyncHandler(async (req, res) => {
  const call = await CallLog.findOne({ _id: req.params.id, ...filter(req) }).populate("agentId", "agentName");
  if (!call) throw new ApiError(404, "Call log not found");
  res.json(call);
});

export const deleteCall = asyncHandler(async (req, res) => {
  const call = await CallLog.findOne({ _id: req.params.id, ...filter(req) });
  if (!call) throw new ApiError(404, "Call log not found");
  await call.deleteOne();
  res.json({ message: "Call log deleted" });
});

export const downloadCallRecording = asyncHandler(async (req, res) => {
  const call = await CallLog.findOne({ _id: req.params.id, ...filter(req) });
  if (!call) throw new ApiError(404, "Call log not found");
  if (!call.recordingUrl) throw new ApiError(404, "Recording is not available for this call.");

  const response = await axios.get(call.recordingUrl, { responseType: "stream" });
  const contentType = response.headers["content-type"] || "audio/mpeg";
  const extension = contentType.includes("wav") ? "wav" : contentType.includes("ogg") ? "ogg" : "mp3";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="call-recording-${call._id}.${extension}"`);
  response.data.pipe(res);
});

export const retryCall = asyncHandler(async (req, res) => {
  const call = await CallLog.findOne({ _id: req.params.id, ...filter(req) });
  if (!call) throw new ApiError(404, "Call log not found");
  if (!call.agentId) throw new ApiError(400, "Call is missing an assigned agent.");

  const phoneNumber = call.callerNumber || call.callingNumber || call.leadData?.phone || call.leadData?.phone_number || call.leadData?.phoneNumber || "";
  let lead = call.leadId ? await Lead.findOne({ _id: call.leadId, ...filter(req) }) : null;
  if (!lead && phoneNumber) {
    lead = await Lead.findOne({ phone: phoneNumber, agentId: call.agentId, ...filter(req) }).sort({ createdAt: -1 });
  }
  if (!lead && phoneNumber) {
    lead = await Lead.create({
      userId: call.userId || req.user._id,
      agentId: call.agentId,
      callLogId: call._id,
      name: phoneNumber,
      phone: phoneNumber,
      source: "call",
      status: "follow_up",
      notes: [{ text: "Lead created automatically for manual retry call." }]
    });
    call.leadId = lead._id;
    await call.save();
  }
  if (!lead) throw new ApiError(400, "Call is not linked to a lead and has no phone number.");

  const followUp = await FollowUp.create({
    userId: call.userId || req.user._id,
    agentId: call.agentId,
    leadId: lead._id,
    callLogId: call._id,
    phoneNumber,
    type: "call",
    trigger: "manual",
    status: "scheduled",
    scheduledAt: new Date(),
    maxAttempts: 3,
    note: "Manual retry call from call log"
  });

  const result = await runFollowUp(followUp);
  res.status(202).json({ success: true, followUp: result || followUp });
});

function compactUpdate(update) {
  return Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
}

export const syncCall = asyncHandler(async (req, res) => {
  const callLog = await CallLog.findOne({ _id: req.params.id, ...filter(req) });
  if (!callLog) throw new ApiError(404, "Call log not found");

  let workflowId = callLog.dograhWorkflowId;
  if (!workflowId && callLog.agentId) {
    const agent = await Agent.findOne({ _id: callLog.agentId, ...filter(req) });
    workflowId = agent?.dograhWorkflowId || agent?.providerWorkflowId || "";
    if (workflowId) {
      callLog.dograhWorkflowId = workflowId;
      await callLog.save();
    }
  }

  if (!workflowId) {
    throw new ApiError(400, "Dograh workflow ID is missing for this call log.");
  }

  if (!callLog.dograhRunId) {
    throw new ApiError(400, "Dograh run ID missing for this call log. Check trigger response mapping.", { success: false });
  }

  const updatedCallLog = await syncCallLogWithDograhRun({
    callLog,
    workflowId,
    runId: callLog.dograhRunId
  });

  // Manual sync success resets auto-pipeline failure tracking
  await CallLog.findByIdAndUpdate(updatedCallLog._id, {
    $set: { autoSyncFailureCount: 0, autoSyncedAt: new Date(), pipelineStatus: "synced", lastPipelineError: null }
  });

  res.json({ success: true, callLog: updatedCallLog });
});

export const extractLeadForCall = asyncHandler(async (req, res) => {
  const callLog = await CallLog.findOne({ _id: req.params.id, ...filter(req) });
  if (!callLog) throw new ApiError(404, "Call log not found");

  const result = await extractLeadForCallLog(callLog, { failOnGeminiError: true });

  // Manual extract success resets auto-pipeline failure tracking
  if (result.lead) {
    await CallLog.findByIdAndUpdate(callLog._id, {
      $set: {
        autoExtractFailureCount: 0,
        autoExtractedAt: new Date(),
        pipelineStatus: "completed",
        lastPipelineError: null
      }
    });
  }

  res.json({
    success: true,
    callLog: result.callLog,
    lead: result.lead || null,
    extracted: result.extracted || null
  });
});

export const syncCallByRun = asyncHandler(async (req, res) => {
  const { workflowId, runId, callLogId } = req.body;

  if (!workflowId) throw new ApiError(400, "workflowId is required.");
  if (!runId) throw new ApiError(400, "runId is required.");

  let callLog = null;

  if (callLogId) {
    callLog = await CallLog.findOne({ _id: callLogId, ...filter(req) });
    if (!callLog) throw new ApiError(404, "Call log not found");
  } else {
    callLog = await CallLog.findOne({
      ...filter(req),
      dograhWorkflowId: workflowId,
      dograhRunId: runId
    });
  }

  const existingAgent = callLog?.agentId ? await Agent.findById(callLog.agentId) : null;
  const runDetails = await getDograhCallRunDetails(workflowId, runId, { userId: callLog?.userId || req.user._id, agent: existingAgent });

  if (!callLog) {
    const agent = await Agent.findOne({
      ...filter(req),
      dograhWorkflowId: workflowId
    });

    callLog = await CallLog.create({
      userId: agent?.userId || req.user._id,
      agentId: agent?._id,
      dograhWorkflowId: workflowId,
      dograhWorkflowUuid: agent?.dograhWorkflowUuid,
      dograhRunId: runId,
      source: "dograh",
      callDirection: "outbound",
      status: "initiated",
      rawRunDetails: runDetails
    });
  }

  const updatedCallLog = await applyRunDetailsToCallLog(callLog, runDetails);

  res.json({ success: true, callLog: updatedCallLog, runDetails });
});

async function syncCallLogWithDograhRun({ callLog, workflowId, runId }) {
  try {
    const agent = callLog.agentId ? await Agent.findById(callLog.agentId) : null;
    const runDetails = await getDograhCallRunDetails(workflowId, runId, { userId: callLog.userId, agent });
    return applyRunDetailsToCallLog(callLog, runDetails);
  } catch (error) {
    console.log("Dograh run sync failed:", { status: error.response?.status, message: error.message });
    throw error;
  }
}

async function applyRunDetailsToCallLog(callLog, runDetails) {
  const mapped = normalizeDograhRunDetails(runDetails);
  console.log("Mapped Dograh run details:", mapped);
  console.log("Dograh gathered_context:", runDetails?.gathered_context || runDetails?.data?.gathered_context || runDetails?.data?.run?.gathered_context);
  console.log("Dograh analysis:", runDetails?.analysis || runDetails?.data?.analysis || runDetails?.data?.run?.analysis);
  console.log("Dograh extracted leadData:", mapped.leadData);
  console.log("Dograh realtime events:", (runDetails?.logs?.realtime_feedback_events || runDetails?.data?.logs?.realtime_feedback_events || runDetails?.data?.run?.logs?.realtime_feedback_events)?.map((event) => event.type));

  const leadData = mapped.leadData || null;
  const leadCaptured = hasUsefulLeadData(leadData);

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
