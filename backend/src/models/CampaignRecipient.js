import mongoose from "mongoose";

const campaignRecipientSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", index: true },
    name: String,
    phone: { type: String, required: true },
    email: String,
    status: {
      type: String,
      enum: ["queued", "scheduled", "calling", "answered", "completed", "no_answer", "busy", "failed", "declined", "skipped", "cancelled"],
      default: "queued",
      index: true
    },
    scheduledAt: { type: Date, index: true },
    attemptCount: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    lastCallLogId: { type: mongoose.Schema.Types.ObjectId, ref: "CallLog" },
    lastOutcome: String,
    lastError: String,
    dograhRunId: String,
    notes: String
  },
  { timestamps: true }
);

campaignRecipientSchema.index({ campaignId: 1, phone: 1 }, { unique: true });
campaignRecipientSchema.index({ status: 1, scheduledAt: 1 });

export default mongoose.model("CampaignRecipient", campaignRecipientSchema);
