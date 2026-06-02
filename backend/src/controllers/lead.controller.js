import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import { extractRunId } from "../services/callLogMapper.js";
import { triggerDograhOutboundCallByWorkflow } from "../services/dograh.service.js";

function filter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
}

export const listLeads = asyncHandler(async (req, res) => {
  const leads = await Lead.find(filter(req)).populate("agentId", "agentName dograhWorkflowId dograhWorkflowUuid callerIdNumber").populate("callLogId").sort({ createdAt: -1 });
  res.json(leads);
});

export const getLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, ...filter(req) }).populate("agentId callLogId");
  if (!lead) throw new ApiError(404, "Lead not found");
  res.json(lead);
});

export const updateLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, ...filter(req) });
  if (!lead) throw new ApiError(404, "Lead not found");
  if (req.body.note) lead.notes.push({ text: req.body.note });
  Object.assign(lead, { ...req.body, note: undefined });
  await lead.save();
  res.json(lead);
});

export const deleteLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, ...filter(req) });
  if (!lead) throw new ApiError(404, "Lead not found");
  await lead.deleteOne();
  res.json({ success: true, message: "Lead deleted successfully" });
});

export const exportLeadsCsv = asyncHandler(async (req, res) => {
  const leads = await Lead.find(filter(req)).populate("agentId", "agentName");
  const rows = [["Name", "Phone", "Email", "Requirement", "Agent", "Status", "Created Date"]];
  leads.forEach((lead) => rows.push([
    lead.name || "",
    lead.phone || "",
    lead.email || "",
    lead.requirement || "",
    lead.agentId?.agentName || "",
    lead.status || "",
    lead.createdAt.toISOString()
  ]));

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=leads.csv");
  res.send(rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"));
});

export const callLeadAgain = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({ _id: req.params.id, ...filter(req) }).populate("agentId");
  if (!lead) throw new ApiError(404, "Lead not found");

  const agent = lead.agentId;
  if (!agent?.dograhWorkflowUuid) throw new ApiError(400, "Agent is not connected to a Dograh workflow.");
  if (!agent?.callerIdNumber) throw new ApiError(400, "Caller ID number is missing for this agent.");
  if (!lead.phone) throw new ApiError(400, "Lead phone number is missing.");

  const payload = {
    phone_number: lead.phone,
    calling_number: agent.callerIdNumber,
    initial_context: {
      customerName: lead.name,
      phoneNumber: lead.phone,
      requirement: lead.requirement,
      preferredTime: lead.preferredTime,
      businessName: agent.businessName,
      agentName: agent.agentName,
      localAgentId: agent._id.toString()
    },
    metadata: {
      localAgentId: agent._id.toString(),
      leadId: lead._id.toString(),
      source: "lead_call_again"
    }
  };

  const dograhResponse = await triggerDograhOutboundCallByWorkflow(agent.dograhWorkflowUuid, payload);
  const dograhRunId = extractRunId(dograhResponse);

  const callLog = await CallLog.create({
    userId: lead.userId,
    agentId: agent._id,
    leadId: lead._id,
    source: "lead_call_again",
    callDirection: "outbound",
    callerNumber: lead.phone,
    callingNumber: agent.callerIdNumber,
    dograhWorkflowId: agent.dograhWorkflowId,
    dograhWorkflowUuid: agent.dograhWorkflowUuid,
    dograhRunId: dograhRunId ? String(dograhRunId) : null,
    status: dograhResponse?.status || "initiated",
    rawDograhPayload: dograhResponse,
    startedAt: new Date()
  });

  lead.callLogId = callLog._id;
  await lead.save();

  res.status(202).json({ success: true, lead, callLog, dograhResponse });
});
