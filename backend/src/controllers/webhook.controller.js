import mongoose from "mongoose";
import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import User from "../models/User.js";
import WebhookEvent from "../models/WebhookEvent.js";
import { extractCallFields, hasUsefulLeadData, normalizeLeadData, pick } from "../services/callLogMapper.js";

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
    const agent = await Agent.findOne({ dograhWorkflowId: fields.dograhWorkflowId });
    if (agent) return agent;
  }

  return null;
}

async function upsertLead({ agent, callLog, leadData }) {
  if (!hasUsefulLeadData(leadData)) return false;

  const existingLead = await Lead.findOne({ callLogId: callLog._id });
  if (existingLead) return false;

  await Lead.create({
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
  });

  return true;
}

function compactUpdate(update) {
  return Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
}

export async function dograhWebhook(req, res) {
  const payload = req.body || {};
  console.log("Dograh webhook received:", JSON.stringify(payload, null, 2));

  try {
    const fields = extractCallFields(payload);
    const agent = await findAgent(fields);

    if (!agent) {
      await WebhookEvent.create({
        provider: "dograh",
        eventType: pick(fields.status, payload.event, payload.type, "unmatched"),
        payload
      });

      return res.status(200).json({
        success: true,
        warning: "Webhook received but no matching call log found"
      });
    }

    const leadData = normalizeLeadData(payload);
    const leadCaptured = hasUsefulLeadData(leadData);
    const update = compactUpdate({
      userId: agent.userId,
      agentId: agent._id,
      dograhWorkflowId: fields.dograhWorkflowId || agent.dograhWorkflowId,
      dograhWorkflowUuid: fields.dograhWorkflowUuid || agent.dograhWorkflowUuid,
      dograhRunId: fields.dograhRunId,
      callerNumber: fields.callerNumber,
      callingNumber: fields.callingNumber,
      status: fields.status || "completed",
      callDirection: "outbound",
      source: "dograh",
      duration: fields.duration,
      durationSeconds: fields.durationSeconds,
      transcript: fields.transcript,
      summary: fields.summary,
      recordingUrl: fields.recordingUrl,
      transcriptUrl: fields.transcriptUrl,
      leadCaptured,
      leadData: leadCaptured ? leadData : undefined,
      rawWebhookPayload: payload,
      startedAt: fields.startedAt,
      endedAt: fields.endedAt
    });

    const query = fields.dograhRunId
      ? { agentId: agent._id, dograhRunId: fields.dograhRunId }
      : { agentId: agent._id, dograhWorkflowUuid: fields.dograhWorkflowUuid || agent.dograhWorkflowUuid, callerNumber: fields.callerNumber };

    const callLog = await CallLog.findOneAndUpdate(
      query,
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const leadCreated = await upsertLead({ agent, callLog, leadData });
    await WebhookEvent.create({
      provider: "dograh",
      eventType: fields.status || payload.event,
      payload,
      matchedAgentId: agent._id,
      matchedCallLogId: callLog._id
    });

    agent.totalCalls = await CallLog.countDocuments({ agentId: agent._id });
    if (leadCreated) agent.totalLeads += 1;

    const durationSeconds = fields.durationSeconds || 0;
    await Promise.all([
      agent.save(),
      durationSeconds > 0
        ? User.findByIdAndUpdate(agent.userId, { $inc: { minutesUsed: Math.ceil(durationSeconds / 60) } })
        : Promise.resolve()
    ]);

    console.log("CallLog updated from Dograh:", callLog._id);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Dograh webhook processing failed:", error);
    return res.status(200).json({ success: true, warning: "Webhook received but processing failed" });
  }
}
