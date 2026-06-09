import Appointment from "../models/Appointment.js";
import FollowUp from "../models/FollowUp.js";
import Lead from "../models/Lead.js";
import { ApiError } from "../utils/apiError.js";

const DEFAULT_DURATION_MINUTES = 30;
const APPOINTMENT_TEST_MODE = String(process.env.APPOINTMENT_TEST_MODE || "").toLowerCase() === "true";

export function assertTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new ApiError(400, "Timezone is not valid.");
  }
}

function parseLocalDateTime(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new ApiError(400, "Appointment date/time must use YYYY-MM-DDTHH:mm format.");

  const [, year, month, day, hour, minute] = match.map(Number);
  return { year, month, day, hour, minute };
}

function zonedParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    hour12: false
  });

  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function localTimeToUtc(localDateTime, timezone) {
  assertTimezone(timezone);
  const wanted = parseLocalDateTime(localDateTime);
  const wantedAsUtc = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute);
  const guessedDate = new Date(wantedAsUtc);
  const parts = zonedParts(guessedDate, timezone);
  const actualAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const utcDate = new Date(wantedAsUtc + (wantedAsUtc - actualAsUtc));
  const roundTrip = zonedParts(utcDate, timezone);

  if (
    roundTrip.year !== wanted.year ||
    roundTrip.month !== wanted.month ||
    roundTrip.day !== wanted.day ||
    roundTrip.hour !== wanted.hour ||
    roundTrip.minute !== wanted.minute
  ) {
    throw new ApiError(400, "Appointment time is not valid in the selected timezone.");
  }

  return utcDate;
}

export function parseAppointmentDateTime({ date, time, timezone }) {
  if (!date || !time) throw new ApiError(400, "Date and time are required.");

  const parsed = localTimeToUtc(`${date}T${time}`, timezone);
  if (Number.isNaN(parsed.getTime())) throw new ApiError(400, "Appointment date/time is invalid.");

  return parsed;
}

function calculateReminderAt(startAt, requestedReminderAt) {
  if (requestedReminderAt && !APPOINTMENT_TEST_MODE) return new Date(requestedReminderAt);
  const offsetMs = APPOINTMENT_TEST_MODE ? 60 * 1000 : 60 * 60 * 1000;
  return new Date(startAt.getTime() - offsetMs);
}

async function createAppointmentCallFollowUp(appointment, lead) {
  if (appointment.startAt <= new Date()) {
    throw new ApiError(400, "Appointment call time has already passed.");
  }

  const followUp = await FollowUp.findOneAndUpdate(
    {
      userId: appointment.userId,
      agentId: appointment.agentId,
      leadId: appointment.leadId,
      appointmentId: appointment._id,
      trigger: "appointment_call"
    },
    {
      $set: {
        phoneNumber: appointment.customerPhone || lead?.phone || "",
        type: "call",
        trigger: "appointment_call",
        status: "scheduled",
        scheduledAt: appointment.startAt,
        maxAttempts: 1,
        note: `Appointment call scheduled for ${appointment.startAt.toISOString()}`
      },
      $setOnInsert: {
        userId: appointment.userId,
        agentId: appointment.agentId,
        leadId: appointment.leadId,
        appointmentId: appointment._id
      }
    },
    { new: true, upsert: true }
  );

  appointment.appointmentCallScheduled = true;
  appointment.appointmentCallStatus = "scheduled";
  appointment.appointmentCallFollowUpId = followUp._id;
  console.log("appointment_call created:", {
    appointmentId: appointment._id,
    followUpId: followUp._id,
    scheduledAt: followUp.scheduledAt
  });
  return followUp;
}

async function createReminderFollowUp(appointment, lead, calculatedReminderAt) {
  if (!appointment.reminderEnabled) {
    appointment.reminderAt = undefined;
    appointment.reminderStatus = "not_requested";
    appointment.reminderSkipReason = "";
    return null;
  }

  appointment.reminderAt = calculatedReminderAt;
  console.log("Appointment reminderAt calculated:", {
    appointmentId: appointment._id,
    reminderAt: calculatedReminderAt
  });

  if (!calculatedReminderAt || Number.isNaN(calculatedReminderAt.getTime()) || calculatedReminderAt <= new Date()) {
    appointment.reminderStatus = "skipped";
    appointment.reminderSkipReason = "Reminder skipped because appointment is too soon";
    appointment.reminderFollowUpId = undefined;
    await FollowUp.updateMany(
      {
        appointmentId: appointment._id,
        trigger: "appointment_reminder",
        status: { $in: ["pending", "scheduled", "running"] }
      },
      {
        $set: {
          status: "cancelled",
          lastError: appointment.reminderSkipReason
        }
      }
    );
    console.log("Appointment reminder skipped:", {
      appointmentId: appointment._id,
      reason: appointment.reminderSkipReason
    });
    return null;
  }

  const followUp = await FollowUp.findOneAndUpdate(
    {
      userId: appointment.userId,
      agentId: appointment.agentId,
      leadId: appointment.leadId,
      appointmentId: appointment._id,
      trigger: "appointment_reminder"
    },
    {
      $set: {
        phoneNumber: appointment.customerPhone || lead?.phone || "",
        type: "call",
        trigger: "appointment_reminder",
        status: "scheduled",
        scheduledAt: appointment.reminderAt,
        maxAttempts: 1,
        note: `Appointment reminder for ${appointment.startAt.toISOString()}`
      },
      $setOnInsert: {
        userId: appointment.userId,
        agentId: appointment.agentId,
        leadId: appointment.leadId,
        appointmentId: appointment._id
      }
    },
    { new: true, upsert: true }
  );

  appointment.reminderStatus = "scheduled";
  appointment.reminderSkipReason = "";
  appointment.reminderFollowUpId = followUp._id;
  console.log("Appointment reminder created:", {
    appointmentId: appointment._id,
    followUpId: followUp._id,
    scheduledAt: followUp.scheduledAt
  });
  return followUp;
}

export async function syncAppointmentFollowUps(appointment, lead, requestedReminderAt) {
  console.log("Appointment startAt:", {
    appointmentId: appointment._id,
    startAt: appointment.startAt
  });
  const calculatedReminderAt = appointment.reminderEnabled ? calculateReminderAt(appointment.startAt, requestedReminderAt) : undefined;
  const appointmentCall = await createAppointmentCallFollowUp(appointment, lead);
  const reminder = await createReminderFollowUp(appointment, lead, calculatedReminderAt);
  await appointment.save();

  return {
    appointmentCallScheduled: Boolean(appointmentCall),
    reminderStatus: appointment.reminderStatus,
    reminderSkipReason: appointment.reminderSkipReason || "",
    reminderAt: appointment.reminderAt,
    appointmentCallStatus: appointment.appointmentCallStatus,
    appointmentCallScheduledAt: appointment.startAt
  };
}

export async function createAppointmentRecord({
  userId,
  agent,
  lead,
  callLogId,
  title,
  appointmentType = "consultation",
  date,
  time,
  timezone,
  startAt,
  endAt,
  customerName,
  customerPhone,
  customerEmail,
  notes = "",
  source = "manual",
  reminderEnabled = true,
  reminderAt
}) {
  const finalStartAt = startAt ? new Date(startAt) : parseAppointmentDateTime({ date, time, timezone });
  if (Number.isNaN(finalStartAt.getTime())) throw new ApiError(400, "Appointment start time is invalid.");
  if (finalStartAt <= new Date()) throw new ApiError(400, "Appointment start time must be in the future.");
  const finalEndAt = endAt ? new Date(endAt) : new Date(finalStartAt.getTime() + DEFAULT_DURATION_MINUTES * 60 * 1000);

  const existing = await Appointment.findOne({
    userId,
    agentId: agent._id,
    leadId: lead._id,
    startAt: finalStartAt,
    status: { $in: ["scheduled", "rescheduled"] }
  });
  if (existing) return { appointment: existing, created: false, meta: {
    appointmentCallScheduled: existing.appointmentCallScheduled,
    reminderStatus: existing.reminderStatus,
    reminderSkipReason: existing.reminderSkipReason || "",
    reminderAt: existing.reminderAt,
    appointmentCallStatus: existing.appointmentCallStatus || (existing.status === "completed" ? "completed" : "scheduled"),
    appointmentCallScheduledAt: existing.startAt
  } };

  const appointment = await Appointment.create({
    userId,
    agentId: agent._id,
    leadId: lead._id,
    callLogId,
    title: title || `${appointmentType} with ${lead.name || lead.businessName || lead.phone || "lead"}`,
    appointmentType,
    date,
    time,
    timezone,
    startAt: finalStartAt,
    endAt: finalEndAt,
    customerName: customerName || lead.contactName || lead.name || lead.businessName || "",
    customerPhone: customerPhone || lead.phone || "",
    customerEmail: customerEmail || lead.email || "",
    status: "scheduled",
    notes,
    source,
    reminderEnabled,
    reminderStatus: reminderEnabled ? "skipped" : "not_requested",
    appointmentCallStatus: "scheduled"
  });

  lead.status = "appointment_booked";
  lead.notes = lead.notes || [];
  lead.notes.push({ text: `Appointment booked for ${finalStartAt.toLocaleString([], { timeZone: timezone })}` });
  await lead.save();
  const meta = await syncAppointmentFollowUps(appointment, lead, reminderAt);

  return { appointment, created: true, meta };
}
