import mongoose from "mongoose";

// One queued Gmail campaign email per recipient. The Gmail campaign worker atomically claims
// these rows and sends each as a separate personalized message (never a BCC blast).
const emailCampaignRecipientSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailCampaign", required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", index: true },
    emailIntegrationId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailIntegration" },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
    toEmail: { type: String, required: true },
    toName: { type: String, default: "" },
    personalizedSubject: { type: String, default: "" },
    personalizedBody: { type: String, default: "" },
    status: {
      type: String,
      enum: ["queued", "processing", "sent", "failed", "skipped", "paused"],
      default: "queued",
      index: true
    },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lockedAt: Date,
    lockedBy: String,
    provider: { type: String, default: "gmail" },
    providerMessageId: { type: String, default: "" },
    providerThreadId: { type: String, default: "" },
    error: { type: String, default: "" },
    sentAt: Date
  },
  { timestamps: true }
);

// Prevents the same recipient from being queued twice for a campaign (idempotent enqueue).
emailCampaignRecipientSchema.index({ campaignId: 1, toEmail: 1 }, { unique: true });
// Worker claim query: due, claimable recipients ordered by nextAttemptAt.
emailCampaignRecipientSchema.index({ status: 1, nextAttemptAt: 1 });

export default mongoose.model("EmailCampaignRecipient", emailCampaignRecipientSchema);
