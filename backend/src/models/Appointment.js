import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    callLogId: { type: mongoose.Schema.Types.ObjectId, ref: "CallLog" },
    title: { type: String, required: true },
    appointmentType: { type: String, enum: ["call", "meeting", "demo", "visit", "consultation"], default: "consultation" },
    date: String,
    time: String,
    timezone: { type: String, required: true },
    startAt: { type: Date, required: true, index: true },
    endAt: Date,
    customerName: String,
    customerPhone: String,
    customerEmail: String,
    status: { type: String, enum: ["scheduled", "completed", "cancelled", "rescheduled", "missed"], default: "scheduled", index: true },
    completedAt: Date,
    notes: String,
    source: { type: String, enum: ["ai_call", "web_call", "manual", "message"], default: "manual" },
    reminderEnabled: { type: Boolean, default: true },
    reminderSent: { type: Boolean, default: false },
    reminderAt: Date,
    reminderStatus: { type: String, enum: ["not_requested", "scheduled", "skipped"], default: "not_requested" },
    reminderSkipReason: String,
    reminderFollowUpId: { type: mongoose.Schema.Types.ObjectId, ref: "FollowUp" },
    appointmentCallScheduled: { type: Boolean, default: false },
    appointmentCallStatus: { type: String, enum: ["scheduled", "running", "completed", "failed", "missed", "cancelled"], default: "scheduled", index: true },
    appointmentCallFollowUpId: { type: mongoose.Schema.Types.ObjectId, ref: "FollowUp" }
  },
  { timestamps: true }
);

appointmentSchema.index({ userId: 1, agentId: 1, leadId: 1, startAt: 1 });
// Appointments list filters by userId and sorts by createdAt desc.
appointmentSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Appointment", appointmentSchema);
