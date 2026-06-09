import Agent from "../models/Agent.js";
import Appointment from "../models/Appointment.js";
import FollowUp from "../models/FollowUp.js";
import Lead from "../models/Lead.js";
import { triggerOutboundCallForAgent } from "./outboundCall.service.js";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export function emailFollowUpTime(date = new Date()) {
  return new Date(date.getTime() + TWO_DAYS_MS);
}

export async function createEmailSentFollowUp({ userId, agentId, leadId, campaignId, emailLogId, scheduledAt = emailFollowUpTime() }) {
  if (!leadId || !campaignId) return null;

  return FollowUp.findOneAndUpdate(
    {
      userId,
      leadId,
      campaignId,
      trigger: "email_sent"
    },
    {
      $setOnInsert: {
        userId,
        agentId,
        leadId,
        campaignId,
        emailLogId,
        type: "call",
        trigger: "email_sent",
        status: "scheduled",
        scheduledAt,
        maxAttempts: 3,
        note: "Call follow-up automatically scheduled after successful email outreach."
      }
    },
    { new: true, upsert: true }
  );
}

export async function pauseEmailSentFollowUpsForLead({ userId, leadId, campaignId, note = "Paused because the lead replied to the outreach email." }) {
  if (!userId || !leadId) return { modifiedCount: 0 };
  const query = {
    userId,
    leadId,
    trigger: "email_sent",
    status: { $in: ["pending", "scheduled", "failed"] }
  };
  if (campaignId) query.campaignId = campaignId;

  return FollowUp.updateMany(query, {
    $set: {
      status: "cancelled",
      lastError: "",
      note
    }
  });
}

export async function runFollowUp(followUp) {
  const claimed = await FollowUp.findOneAndUpdate(
    {
      _id: followUp._id,
      status: { $in: ["pending", "scheduled", "failed"] },
      attemptCount: { $lt: followUp.maxAttempts || 3 }
    },
    { $set: { status: "running", lastError: "" }, $inc: { attemptCount: 1 } },
    { new: true }
  );

  if (!claimed) return null;

  try {
    if (claimed.trigger === "appointment_call" && claimed.appointmentId) {
      await Appointment.findOneAndUpdate(
        { _id: claimed.appointmentId, userId: claimed.userId },
        { $set: { appointmentCallStatus: "running" } }
      );
    }

    if (claimed.type !== "call") {
      throw new Error("Only call follow-ups are supported in this phase.");
    }

    const [agent, lead] = await Promise.all([
      Agent.findOne({ _id: claimed.agentId, userId: claimed.userId }),
      Lead.findOne({ _id: claimed.leadId, userId: claimed.userId })
    ]);

    if (!agent) throw new Error("Linked agent was not found.");
    if (!lead) throw new Error("Linked lead was not found.");
    if (!lead.phone) throw new Error("Lead phone number is missing.");

    const { callLog } = await triggerOutboundCallForAgent({
      agent,
      userId: claimed.userId,
      phoneNumber: lead.phone
    });

    callLog.leadId = lead._id;
    await callLog.save();

    claimed.callLogId = callLog._id;
    claimed.status = "completed";
    claimed.completedAt = new Date();
    await claimed.save();

    if (claimed.trigger === "appointment_call" && claimed.appointmentId) {
      await Appointment.findOneAndUpdate(
        { _id: claimed.appointmentId, userId: claimed.userId },
        {
          $set: {
            appointmentCallStatus: "completed",
            status: "completed",
            completedAt: claimed.completedAt
          }
        }
      );
    }

    return claimed;
  } catch (error) {
    claimed.status = claimed.attemptCount >= claimed.maxAttempts ? "failed" : "scheduled";
    claimed.lastError = error.message || "Follow-up failed.";
    if (claimed.status === "scheduled") {
      claimed.scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
    }
    await claimed.save();
    if (claimed.trigger === "appointment_call" && claimed.appointmentId) {
      await Appointment.findOneAndUpdate(
        { _id: claimed.appointmentId, userId: claimed.userId },
        { $set: { appointmentCallStatus: claimed.status === "failed" ? "failed" : "scheduled" } }
      );
    }
    throw error;
  }
}
