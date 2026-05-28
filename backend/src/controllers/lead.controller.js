import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Lead from "../models/Lead.js";

function filter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
}

export const listLeads = asyncHandler(async (req, res) => {
  const leads = await Lead.find(filter(req)).populate("agentId", "agentName").sort({ createdAt: -1 });
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
  res.json({ message: "Lead deleted" });
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
