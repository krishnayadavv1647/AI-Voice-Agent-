import axios from "axios";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import FollowUp from "../models/FollowUp.js";
import { applyCallOutcomeToLog, scheduleRetryFollowUpForCall } from "../services/callOutcome.service.js";
import { hasUsefulLeadData, normalizeDograhRunDetails } from "../services/callLogMapper.js";
import { getDograhCallRunDetails } from "../services/dograh.service.js";
import { runFollowUp } from "../services/followUp.service.js";
import { createAppointmentRecord } from "../services/appointment.service.js";
import { extractAppointmentFromTranscript } from "../services/appointmentExtraction.service.js";
import { extractLeadFromCallTranscript } from "../services/leadExtraction.service.js";
import { normalizeLeadToEnglish } from "../services/leadEnglishNormalizer.js";

function filter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
}

export const listCalls = asyncHandler(async (req, res) => {
  const calls = await CallLog.find(filter(req)).populate("agentId", "agentName").sort({ createdAt: -1 });
  res.json(calls);
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

export const retryCall = asyncHandler(async (req, res) => {
  const call = await CallLog.findOne({ _id: req.params.id, ...filter(req) });
  if (!call) throw new ApiError(404, "Call log not found");
  if (!call.agentId) throw new ApiError(400, "Call is missing an assigned agent.");

  let lead = call.leadId ? await Lead.findOne({ _id: call.leadId, ...filter(req) }) : null;
  if (!lead && call.callerNumber) {
    lead = await Lead.findOne({ phone: call.callerNumber, agentId: call.agentId, ...filter(req) }).sort({ createdAt: -1 });
  }
  if (!lead && call.callerNumber) {
    lead = await Lead.create({
      userId: call.userId || req.user._id,
      agentId: call.agentId,
      callLogId: call._id,
      name: call.callerNumber,
      phone: call.callerNumber,
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

async function fetchTranscriptFromUrl(transcriptUrl) {
  if (!transcriptUrl) return null;

  const response = await axios.get(transcriptUrl, {
    responseType: "text"
  });

  return typeof response.data === "string"
    ? response.data
    : JSON.stringify(response.data);
}

function buildLeadPayload(callLog, leadData) {
  return normalizeLeadToEnglish({
    userId: callLog.userId,
    agentId: callLog.agentId,
    callLogId: callLog._id,
    name:
      leadData.customer_name ||
      leadData.customerName ||
      leadData.name ||
      "",
    phone:
      leadData.phone_number ||
      leadData.phoneNumber ||
      leadData.phone ||
      callLog.callerNumber ||
      "",
    email: leadData.email || "",
    requirement:
      leadData.requirement ||
      leadData.intent ||
      "",
    preferredDate:
      leadData.booking_date ||
      leadData.preferred_date ||
      leadData.preferredDate ||
      "",
    preferredTime:
      leadData.booking_time ||
      leadData.preferred_time ||
      leadData.preferredTime ||
      "",
    customFields: {
      numberOfGuests: leadData.number_of_guests || leadData.numberOfGuests || "",
      specialRequest: leadData.special_request || leadData.specialRequest || "",
      confidence: leadData.confidence || "",
      rawExtraction: leadData
    },
    source: "call",
    status: "New"
  });
}

async function upsertLeadFromCallData(callLog, leadData) {
  if (!hasUsefulLeadData(leadData)) return false;
  if (!callLog.userId || !callLog.agentId) return false;

  const leadPayload = buildLeadPayload(callLog, leadData);
  const existingLead = await Lead.findOne({ callLogId: callLog._id });

  if (existingLead) {
    Object.assign(existingLead, {
      ...leadPayload,
      status: existingLead.status || "New",
      notes: existingLead.notes
    });
    await existingLead.save();
    return { lead: existingLead, created: false };
  }

  const lead = await Lead.create(leadPayload);
  return { lead, created: true };
}

async function autoCreateAppointmentFromCall(callLog, lead) {
  if (!lead || !callLog.transcript) return null;
  const agent = callLog.agentId ? await Agent.findById(callLog.agentId) : null;
  if (!agent) return null;

  const extracted = await extractAppointmentFromTranscript(callLog.transcript, agent, lead);
  if (!extracted.appointmentRequested || !extracted.date || !extracted.time) return null;

  const source = callLog.source === "web_call" || callLog.source === "callback_form" ? "web_call" : "ai_call";
  const result = await createAppointmentRecord({
    userId: callLog.userId,
    agent,
    lead,
    callLogId: callLog._id,
    title: extracted.title,
    appointmentType: extracted.appointmentType,
    date: extracted.date,
    time: extracted.time,
    timezone: extracted.timezone || "Asia/Calcutta",
    customerName: extracted.customerName,
    customerPhone: extracted.customerPhone,
    customerEmail: extracted.customerEmail,
    notes: extracted.notes,
    source,
    reminderEnabled: true
  });
  return result.appointment;
}

export const syncCall = asyncHandler(async (req, res) => {
  const callLog = await CallLog.findOne({ _id: req.params.id, ...filter(req) });
  if (!callLog) throw new ApiError(404, "Call log not found");

  if (!callLog.dograhWorkflowId) {
    throw new ApiError(400, "Dograh workflow ID is missing for this call log.");
  }

  if (!callLog.dograhRunId) {
    throw new ApiError(400, "Dograh run ID missing for this call log. Check trigger response mapping.", { success: false });
  }

  const updatedCallLog = await syncCallLogWithDograhRun({
    callLog,
    workflowId: callLog.dograhWorkflowId,
    runId: callLog.dograhRunId
  });

  res.json({ success: true, callLog: updatedCallLog });
});

export const extractLeadForCall = asyncHandler(async (req, res) => {
  const callLog = await CallLog.findOne({ _id: req.params.id, ...filter(req) });
  if (!callLog) throw new ApiError(404, "Call log not found");

  const result = await extractLeadForCallLog(callLog, { failOnGeminiError: true });

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
  } else if (callLog.transcript || callLog.transcriptUrl) {
    console.log("No extracted lead data returned by Dograh. TODO: Gemini transcript-based lead extraction.");
  }

  if (leadResult?.created && callLog.agentId) {
    await Agent.findByIdAndUpdate(callLog.agentId, { $inc: { totalLeads: 1 } });
  }

  if (!leadResult) {
    await extractLeadForCallLog(callLog, { failOnGeminiError: false });
  }

  await scheduleRetryFollowUpForCall(callLog);

  return callLog;
}

async function extractLeadForCallLog(callLog, { failOnGeminiError }) {
  if (!callLog.transcript && callLog.transcriptUrl) {
    console.log("Transcript URL:", callLog.transcriptUrl);

    try {
      const transcript = await fetchTranscriptFromUrl(callLog.transcriptUrl);
      console.log("Transcript length:", transcript?.length);

      if (transcript) {
        callLog.transcript = transcript;
        await callLog.save();
      }
    } catch (error) {
      console.error("Transcript fetch failed:", { status: error.response?.status, message: error.message });
      if (failOnGeminiError) {
        throw new ApiError(502, "Transcript fetch failed. Please try again after Dograh transcript is ready.");
      }
    }
  } else {
    console.log("Transcript URL:", callLog.transcriptUrl);
    console.log("Transcript length:", callLog.transcript?.length);
  }

  if (!callLog.transcript) {
    if (failOnGeminiError) throw new ApiError(400, "Transcript is missing. Sync the call first or wait for Dograh transcript.");
    return { callLog, lead: null, extracted: null };
  }

  const agent = callLog.agentId ? await Agent.findById(callLog.agentId) : null;

  try {
    const extracted = await extractLeadFromCallTranscript({
      transcript: callLog.transcript,
      agent,
      callLog
    });

    console.log("Gemini lead extraction result:", extracted);

    if (!extracted.leadCaptured) {
      callLog.leadCaptured = false;
      callLog.leadData = null;
      await callLog.save();
      return { callLog, lead: null, extracted };
    }

    const leadData = {
      name: extracted.name,
      phone: extracted.phone,
      email: extracted.email,
      requirement: extracted.requirement,
      preferredDate: extracted.preferredDate,
      preferredTime: extracted.preferredTime,
      numberOfGuests: extracted.numberOfGuests,
      specialRequest: extracted.specialRequest,
      summary: extracted.summary,
      confidence: extracted.confidence
    };

    const leadResult = await upsertLeadFromCallData(callLog, leadData);

    if (leadResult) {
      callLog.leadCaptured = true;
      callLog.leadData = extracted;
      callLog.leadId = leadResult.lead._id;
      callLog.summary = callLog.summary || extracted.summary;
      await callLog.save();
      console.log("Lead created/updated:", leadResult.lead?._id);

      if (leadResult.created && callLog.agentId) {
        await Agent.findByIdAndUpdate(callLog.agentId, { $inc: { totalLeads: 1 } });
      }
      await autoCreateAppointmentFromCall(callLog, leadResult.lead);
    }

    return { callLog, lead: leadResult?.lead || null, extracted };
  } catch (error) {
    console.error("Gemini lead extraction result failed:", error.message);
    if (failOnGeminiError) throw error;
    return { callLog, lead: null, extracted: null };
  }
}
