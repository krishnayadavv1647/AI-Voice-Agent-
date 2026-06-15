import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Lead from "../models/Lead.js";
import { normalizeLeadToEnglish } from "../services/leadEnglishNormalizer.js";
import { triggerOutboundCallForAgent } from "../services/outboundCall.service.js";

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
  if (req.body.note) {
    const normalizedNote = normalizeLeadToEnglish({ notes: [{ text: req.body.note }] }).notes[0];
    lead.notes.push(normalizedNote);
  }
  Object.assign(lead, { ...normalizeLeadToEnglish(req.body), note: undefined });
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
  if (!agent?.dograhWorkflowUuid) throw new ApiError(400, "Dograh workflow sync must finish before calling this lead.");
  if (!agent?.callerIdNumber) throw new ApiError(400, "Caller ID number is missing for this agent.");
  if (!lead.phone) throw new ApiError(400, "Lead phone number is missing.");

  const { dograhResponse, callLog, publicCallLog } = await triggerOutboundCallForAgent({
    agent,
    userId: lead.userId,
    phoneNumber: lead.phone,
    leadId: lead._id,
    source: "lead_call_again",
    metadata: {
      customerName: lead.name,
      phoneNumber: lead.phone,
      requirement: lead.requirement,
      preferredTime: lead.preferredTime,
      businessName: agent.businessName,
      agentName: agent.agentName,
      source: "lead_call_again"
    }
  });

  lead.callLogId = callLog._id;
  await lead.save();

  res.status(202).json({ success: true, lead, callLog: publicCallLog, dograhResponse });
});
