import mongoose from "mongoose";

const emailThreadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    emailIntegrationId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailIntegration", index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailCampaign", index: true },
    provider: { type: String, default: "" },
    subject: { type: String, default: "" },
    normalizedSubject: { type: String, default: "", index: true },
    fromEmail: { type: String, default: "" },
    toEmail: { type: String, default: "" },
    replyToEmail: { type: String, default: "", index: true },
    threadHeaders: {
      messageId: String,
      references: [String],
      // Primary Gmail thread identifier (Gmail threadId). Threading uses this first.
      providerThreadId: { type: String, default: "" }
    },
    // Snapshot of the latest Gmail label set for folder filtering (INBOX, SENT, UNREAD, ...).
    labelIds: { type: [String], default: undefined },
    snippet: { type: String, default: "" },
    hasAttachments: { type: Boolean, default: false },
    messagesCount: { type: Number, default: 0 },
    status: { type: String, enum: ["open", "unread", "needs_reply", "replied", "closed"], default: "open", index: true },
    lastMessageAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

emailThreadSchema.index({ userId: 1, leadId: 1, campaignId: 1 });
emailThreadSchema.index({ userId: 1, subject: 1 });
emailThreadSchema.index({ userId: 1, normalizedSubject: 1, toEmail: 1 });
// Fast, exact Gmail thread lookup + upsert dedupe key.
emailThreadSchema.index({ userId: 1, emailIntegrationId: 1, "threadHeaders.providerThreadId": 1 });

export default mongoose.model("EmailThread", emailThreadSchema);
