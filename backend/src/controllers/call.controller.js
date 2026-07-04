import axios from "axios";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import FollowUp from "../models/FollowUp.js";
import { runPipelinePass } from "../services/pipelineScheduler.js";
import { runFollowUp } from "../services/followUp.service.js";
import { extractLeadForCallLog } from "../services/leadGeneration.service.js";
import { getVapiCall, buildEndOfCallMessageFromVapiCall } from "../services/vapi.service.js";
import { processVapiEndOfCall } from "./vapiWebhook.controller.js";

function filter(req) {
  return ["admin", "super_admin"].includes(req.user.role) ? {} : { userId: req.user._id };
}

export const listCalls = asyncHandler(async (req, res) => {
  const calls = await CallLog.find(filter(req)).populate("agentId", "agentName").sort({ createdAt: -1 });
  res.json(calls);
  // Fire-and-forget: catch up any incomplete calls visible on this page load (no lead yet),
  // including terminal-status calls whose transcript/lead never got generated automatically.
  const scopedCallIds = calls
    .filter((c) => !c.leadCaptured && c.providerCallId)
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

export const syncCall = asyncHandler(async (req, res) => {
  const callLog = await CallLog.findOne({ _id: req.params.id, ...filter(req) });
  if (!callLog) throw new ApiError(404, "Call log not found");

  // Calls sync from the Vapi API by providerCallId. Pull the call and run it through the same
  // finalization the webhook uses.
  if (!callLog.providerCallId) {
    throw new ApiError(400, "Vapi call id is missing for this call log, so it cannot be synced yet.");
  }
  const call = await getVapiCall(callLog.providerCallId);
  const message = buildEndOfCallMessageFromVapiCall(call);
  const result = await processVapiEndOfCall(message);
  const updatedCallLog = result?.callLog || (await CallLog.findById(callLog._id));
  await CallLog.findByIdAndUpdate(callLog._id, {
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

