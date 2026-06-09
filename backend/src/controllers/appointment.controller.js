import Agent from "../models/Agent.js";
import Appointment from "../models/Appointment.js";
import FollowUp from "../models/FollowUp.js";
import Lead from "../models/Lead.js";
import { createAppointmentRecord, parseAppointmentDateTime, syncAppointmentFollowUps } from "../services/appointment.service.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function filter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
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
    .sort({ startAt: 1, createdAt: -1 })
    .limit(300);
  res.json(appointments);
});

export const getAppointment = asyncHandler(async (req, res) => {
  res.json(await ownedAppointment(req));
});

export const createAppointment = asyncHandler(async (req, res) => {
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

  const { agent, lead } = await validateAgentLead(req, agentId, leadId);
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
