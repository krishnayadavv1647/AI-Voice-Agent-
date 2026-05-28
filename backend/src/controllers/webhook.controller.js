import mongoose from "mongoose";
import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import User from "../models/User.js";

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function getPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function normalizeLeadData(payload) {
  const leadData = pick(payload.leadData, payload.lead_data, payload.extracted_fields, payload.extractedFields, payload.data?.leadData, {});

  return {
    name: pick(leadData.name, payload.name, payload.customer_name),
    phone: pick(leadData.phone, leadData.phone_number, payload.phone, payload.phone_number, payload.callerNumber, payload.caller_number),
    email: pick(leadData.email, payload.email),
    requirement: pick(leadData.requirement, leadData.intent, payload.requirement, payload.summary),
    preferredDate: pick(leadData.preferredDate, leadData.preferred_date, payload.preferredDate),
    preferredTime: pick(leadData.preferredTime, leadData.preferred_time, payload.preferredTime),
    budget: pick(leadData.budget, payload.budget),
    location: pick(leadData.location, payload.location),
    message: pick(leadData.message, payload.message),
    customFields: leadData.customFields || leadData.custom_fields || {}
  };
}

function hasLeadData(leadData) {
  return Object.values(leadData).some((value) => {
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return Boolean(value);
  });
}

function extractWebhookFields(payload) {
  const metadata = payload.metadata || payload.data?.metadata || payload.run?.metadata || {};

  return {
    metadata,
    localAgentId: pick(metadata.localAgentId, metadata.agentId, payload.localAgentId, payload.agentId, getPath(payload, "data.metadata.localAgentId")),
    dograhWorkflowUuid: pick(
      metadata.dograhWorkflowUuid,
      payload.dograhWorkflowUuid,
      payload.workflow_uuid,
      payload.workflowUuid,
      getPath(payload, "workflow.uuid"),
      getPath(payload, "data.workflow_uuid")
    ),
    dograhWorkflowId: pick(
      metadata.dograhWorkflowId,
      payload.dograhWorkflowId,
      payload.workflow_id,
      payload.workflowId,
      getPath(payload, "workflow.id"),
      getPath(payload, "data.workflow_id")
    ),
    dograhRunId: pick(payload.run_id, payload.runId, payload.id, getPath(payload, "run.id"), getPath(payload, "data.run_id")),
    callerNumber: pick(payload.callerNumber, payload.caller_number, payload.phone_number, payload.phoneNumber, getPath(payload, "call.phone_number")),
    callingNumber: pick(payload.callingNumber, payload.calling_number, payload.caller_id, getPath(payload, "call.calling_number")),
    transcript: pick(payload.transcript, payload.transcript_text, getPath(payload, "artifacts.transcript"), getPath(payload, "data.transcript")),
    summary: pick(payload.summary, getPath(payload, "data.summary"), getPath(payload, "run.summary")),
    duration: pick(payload.duration, payload.duration_seconds, getPath(payload, "call.duration"), getPath(payload, "data.duration")),
    recordingUrl: pick(payload.recordingUrl, payload.recording_url, getPath(payload, "artifacts.recording_url"), getPath(payload, "data.recording_url")),
    transcriptUrl: pick(payload.transcriptUrl, payload.transcript_url, getPath(payload, "artifacts.transcript_url"), getPath(payload, "data.transcript_url")),
    status: pick(payload.status, payload.event, payload.state, getPath(payload, "run.status")),
    startedAt: pick(payload.startedAt, payload.started_at, getPath(payload, "call.started_at")),
    endedAt: pick(payload.endedAt, payload.ended_at, getPath(payload, "call.ended_at"))
  };
}

async function findAgent(fields) {
  if (fields.localAgentId && mongoose.Types.ObjectId.isValid(fields.localAgentId)) {
    const agent = await Agent.findById(fields.localAgentId);
    if (agent) return agent;
  }

  if (fields.dograhWorkflowUuid) {
    const agent = await Agent.findOne({ dograhWorkflowUuid: fields.dograhWorkflowUuid });
    if (agent) return agent;
  }

  if (fields.dograhWorkflowId) {
    return Agent.findOne({ dograhWorkflowId: fields.dograhWorkflowId });
  }

  return null;
}

export async function dograhWebhook(req, res) {
  res.status(200).json({ success: true });

  const payload = req.body || {};
  console.log("Dograh webhook payload:", JSON.stringify(payload));

  try {
    const fields = extractWebhookFields(payload);
    const agent = await findAgent(fields);
    if (!agent) {
      await CallLog.create({
        dograhWorkflowId: fields.dograhWorkflowId,
        dograhWorkflowUuid: fields.dograhWorkflowUuid,
        dograhRunId: fields.dograhRunId,
        callerNumber: fields.callerNumber,
        callingNumber: fields.callingNumber,
        transcript: fields.transcript,
        summary: fields.summary,
        duration: Number(fields.duration || 0),
        recordingUrl: fields.recordingUrl,
        transcriptUrl: fields.transcriptUrl,
        status: fields.status || "unmatched",
        rawDograhPayload: payload,
        startedAt: fields.startedAt,
        endedAt: fields.endedAt
      }).catch(() => {});
      return;
    }

    const leadData = normalizeLeadData(payload);
    const leadCaptured = hasLeadData(leadData);
    const update = {
      userId: agent.userId,
      agentId: agent._id,
      dograhWorkflowId: fields.dograhWorkflowId || agent.dograhWorkflowId,
      dograhWorkflowUuid: fields.dograhWorkflowUuid || agent.dograhWorkflowUuid,
      dograhRunId: fields.dograhRunId,
      callerNumber: fields.callerNumber,
      callingNumber: fields.callingNumber,
      transcript: fields.transcript,
      summary: fields.summary,
      duration: Number(fields.duration || 0),
      recordingUrl: fields.recordingUrl,
      transcriptUrl: fields.transcriptUrl,
      status: fields.status || "received",
      leadCaptured,
      leadData,
      rawDograhPayload: payload,
      startedAt: fields.startedAt,
      endedAt: fields.endedAt
    };

    const query = fields.dograhRunId
      ? { agentId: agent._id, dograhRunId: fields.dograhRunId }
      : { agentId: agent._id, rawDograhPayload: payload };

    const callLog = await CallLog.findOneAndUpdate(query, { $set: update }, { new: true, upsert: true, setDefaultsOnInsert: true });

    if (leadCaptured) {
      const existingLead = await Lead.findOne({ callLogId: callLog._id });
      if (!existingLead) {
        await Lead.create({
          userId: agent.userId,
          agentId: agent._id,
          callLogId: callLog._id,
          ...leadData
        });
        agent.totalLeads += 1;
      }
    }

    agent.totalCalls = await CallLog.countDocuments({ agentId: agent._id });
    await Promise.all([
      agent.save(),
      User.findByIdAndUpdate(agent.userId, { $inc: { minutesUsed: Math.ceil(Number(fields.duration || 0) / 60) } })
    ]);
  } catch (error) {
    console.error("Dograh webhook processing failed:", error);
  }
}
