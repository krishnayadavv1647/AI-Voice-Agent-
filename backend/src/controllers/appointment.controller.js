import Agent from "../models/Agent.js";
import Appointment from "../models/Appointment.js";
import FollowUp from "../models/FollowUp.js";
import Lead from "../models/Lead.js";
import { createAppointmentRecord, parseAppointmentDateTime, syncAppointmentFollowUps } from "../services/appointment.service.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function filter(req) {
  return ["admin", "super_admin"].includes(req.user.role) ? {} : { userId: req.user._id };
}

function maskEmail(value = "") {
  const [name, domain] = String(value || "").split("@");
  if (!name || !domain) return value ? "***" : "";
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(value = "") {
  const text = String(value || "");
  if (text.length <= 4) return text ? "***" : "";
  return `${"*".repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
}

function safeAppointmentPayload(body = {}) {
  return {
    agentId: body.agentId,
    leadId: body.leadId,
    callId: body.callId,
    callLogId: body.callLogId,
    campaignId: body.campaignId,
    appointmentType: body.appointmentType,
    date: body.date,
    time: body.time,
    timezone: body.timezone,
    status: body.status,
    reminderEnabled: body.reminderEnabled,
    hasNotes: Boolean(body.notes),
    customerNamePresent: Boolean(body.customerName || body.name),
    customerPhone: maskPhone(body.customerPhone || body.phone),
    customerEmail: maskEmail(body.customerEmail || body.email)
  };
}

function safeAppointmentSummary(appointment) {
  if (!appointment) return null;
  return {
    id: appointment._id?.toString(),
    userId: appointment.userId?.toString(),
    agentId: appointment.agentId?._id?.toString?.() || appointment.agentId?.toString?.(),
    leadId: appointment.leadId?._id?.toString?.() || appointment.leadId?.toString?.(),
    callLogId: appointment.callLogId?.toString?.(),
    startAt: appointment.startAt,
    status: appointment.status,
    source: appointment.source,
    customerPhone: maskPhone(appointment.customerPhone || appointment.leadId?.phone),
    customerEmail: maskEmail(appointment.customerEmail || appointment.leadId?.email)
  };
}

async function ownedAppointment(req) {
  const appointment = await Appointment.findOne({ _id: req.params.id, ...filter(req) })
    .populate("agentId", "agentName businessName")
    .populate("leadId", "name businessName contactName phone email city");
  if (!appointment) throw new ApiError(404, "Appointment not found.");
  return appointment;
}

async function validateAgentLead(req, agentId, leadId) {
  const [agent, lead] = await Promise.all([
    Agent.findOne({ _id: agentId, ...filter(req) }),
    Lead.findOne({ _id: leadId, ...filter(req) })
  ]);
  if (!agent) throw new ApiError(404, "Agent not found.");
  if (!lead) throw new ApiError(404, "Lead not found.");
  return { agent, lead };
}

export const listAppointments = asyncHandler(async (req, res) => {
  console.log("[Appointment Debug][Backend] List route hit", {
    userId: req.user?._id?.toString(),
    role: req.user?.role,
    query: req.query
  });
  const query = { ...filter(req) };
  if (req.query.agentId) query.agentId = req.query.agentId;
  if (req.query.leadId) query.leadId = req.query.leadId;

  await Appointment.updateMany(
    { ...filter(req), status: "completed", $or: [{ appointmentCallStatus: { $exists: false } }, { appointmentCallStatus: null }] },
    { $set: { appointmentCallStatus: "completed" } }
  );

  const appointments = await Appointment.find(query)
    .populate("agentId", "agentName businessName")
    .populate("leadId", "name businessName contactName phone email city")
    .sort({ createdAt: -1, startAt: 1 })
    .limit(300);
  console.log("[Appointment Debug][Backend] Appointment fetch response", {
    query,
    count: appointments.length,
    appointments: appointments.map(safeAppointmentSummary)
  });
  res.json(appointments);
});

export const getAppointment = asyncHandler(async (req, res) => {
  res.json(await ownedAppointment(req));
});

export const createAppointment = asyncHandler(async (req, res) => {
  console.log("[Appointment Debug][Backend] Create route hit", {
    userId: req.user?._id?.toString(),
    role: req.user?.role,
    payload: safeAppointmentPayload(req.body)
  });
  const {
    agentId,
    leadId,
    title,
    appointmentType,
    date,
    time,
    timezone,
    notes,
    reminderEnabled = true,
    reminderAt
  } = req.body;

  let agent;
  let lead;
  try {
    ({ agent, lead } = await validateAgentLead(req, agentId, leadId));
    console.log("[Appointment Debug][Backend] Validation result", {
      ok: true,
      agentId: agent._id?.toString(),
      leadId: lead._id?.toString(),
      leadPhone: maskPhone(lead.phone),
      leadEmail: maskEmail(lead.email)
    });
  } catch (error) {
    console.log("[Appointment Debug][Backend] Validation result", {
      ok: false,
      message: error.message,
      payload: safeAppointmentPayload(req.body)
    });
    throw error;
  }
  const result = await createAppointmentRecord({
    userId: req.user._id,
    agent,
    lead,
    title,
    appointmentType,
    date,
    time,
    timezone,
    customerName: lead.name || lead.contactName || lead.businessName,
    customerPhone: lead.phone,
    customerEmail: lead.email,
    notes,
    source: "manual",
    reminderEnabled,
    reminderAt
  });

  console.log("[Appointment Debug][Backend] Database create/update result", {
    created: result.created,
    appointment: safeAppointmentSummary(result.appointment),
    meta: result.meta
  });
  res.status(result.created ? 201 : 200).json({ appointment: result.appointment, meta: result.meta });
});

export const updateAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findOne({ _id: req.params.id, ...filter(req) });
  if (!appointment) throw new ApiError(404, "Appointment not found.");

  ["title", "appointmentType", "notes", "reminderEnabled"].forEach((field) => {
    if (req.body[field] !== undefined) appointment[field] = req.body[field];
  });
  await appointment.save();
  res.json(appointment);
});

export const deleteAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findOne({ _id: req.params.id, ...filter(req) });
  if (!appointment) throw new ApiError(404, "Appointment not found.");
  await FollowUp.updateMany(
    { appointmentId: appointment._id, status: { $in: ["pending", "scheduled", "running"] } },
    { $set: { status: "cancelled", lastError: "Appointment deleted" } }
  );
  await appointment.deleteOne();
  res.json({ success: true });
});

export const rescheduleAppointment = asyncHandler(async (req, res) => {
  console.log("[Appointment Debug][Backend] Reschedule route hit", {
    userId: req.user?._id?.toString(),
    appointmentId: req.params.id,
    payload: safeAppointmentPayload(req.body)
  });
  const appointment = await Appointment.findOne({ _id: req.params.id, ...filter(req) });
  if (!appointment) throw new ApiError(404, "Appointment not found.");
  const { date, time, timezone = appointment.timezone } = req.body;
  const startAt = parseAppointmentDateTime({ date, time, timezone });
  if (startAt <= new Date()) throw new ApiError(400, "Appointment start time must be in the future.");
  const duplicate = await Appointment.findOne({
    _id: { $ne: appointment._id },
    userId: appointment.userId,
    agentId: appointment.agentId,
    leadId: appointment.leadId,
    startAt,
    status: { $in: ["scheduled", "rescheduled"] }
  });
  if (duplicate) throw new ApiError(409, "An appointment already exists for this lead at that time.");

  appointment.date = date;
  appointment.time = time;
  appointment.timezone = timezone;
  appointment.startAt = startAt;
  appointment.endAt = new Date(startAt.getTime() + 30 * 60 * 1000);
  appointment.status = "rescheduled";
  appointment.completedAt = undefined;
  appointment.appointmentCallStatus = "scheduled";
  await appointment.save();
  const lead = await Lead.findOne({ _id: appointment.leadId, ...filter(req) });
  const meta = await syncAppointmentFollowUps(appointment, lead);
  console.log("[Appointment Debug][Backend] Database create/update result", {
    operation: "reschedule",
    appointment: safeAppointmentSummary(appointment),
    meta
  });
  res.json({ appointment, meta });
});

export const cancelAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findOne({ _id: req.params.id, ...filter(req) });
  if (!appointment) throw new ApiError(404, "Appointment not found.");
  appointment.status = "cancelled";
  appointment.appointmentCallStatus = "cancelled";
  await appointment.save();
  await FollowUp.updateMany(
    { appointmentId: appointment._id, status: { $in: ["pending", "scheduled", "running"] } },
    { $set: { status: "cancelled", lastError: "Appointment cancelled" } }
  );
  res.json(appointment);
});

export const completeAppointment = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findOne({ _id: req.params.id, ...filter(req) });
  if (!appointment) throw new ApiError(404, "Appointment not found.");
  appointment.status = "completed";
  appointment.appointmentCallStatus = "completed";
  appointment.completedAt = new Date();
  await appointment.save();
  await FollowUp.updateMany(
    { appointmentId: appointment._id, status: { $in: ["pending", "scheduled", "running"] } },
    { $set: { status: "cancelled", lastError: "Appointment completed" } }
  );
  res.json(appointment);
});
