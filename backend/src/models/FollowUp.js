import mongoose from "mongoose";

const followUpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    phoneNumber: String,
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailCampaign" },
    emailLogId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailLog" },
    callLogId: { type: mongoose.Schema.Types.ObjectId, ref: "CallLog" },
    type: { type: String, enum: ["email", "call", "message"], required: true },
    trigger: {
      type: String,
      enum: ["manual", "email_sent", "call_not_picked", "call_completed", "lead_created", "call_declined", "call_busy", "call_failed", "appointment_reminder", "appointment_call"],
      default: "manual",
      index: true
    },
    status: {
      type: String,
      enum: ["pending", "scheduled", "running", "completed", "failed", "cancelled"],
      default: "pending",
      index: true
    },
    scheduledAt: { type: Date, index: true },
    completedAt: Date,
    attemptCount: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    lastError: String,
    note: String
  },
  { timestamps: true }
);

followUpSchema.index({ status: 1, scheduledAt: 1 });
followUpSchema.index({ userId: 1, leadId: 1, campaignId: 1, trigger: 1 });

export default mongoose.model("FollowUp", followUpSchema);
