import mongoose from "mongoose";

const emailMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailThread", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailCampaign", index: true },
    direction: { type: String, enum: ["outbound", "inbound"], required: true, index: true },
    fromEmail: { type: String, default: "" },
    toEmail: { type: String, default: "" },
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    htmlBody: { type: String, default: "" },
    textBody: { type: String, default: "" },
    provider: { type: String, default: "" },
    providerMessageId: { type: String, default: "" },
    providerThreadId: { type: String, default: "" },
    receivedAt: Date,
    sentAt: Date,
    readAt: Date,
    status: { type: String, enum: ["sent", "delivered", "failed", "received", "read", ""], default: "" },
    rawPayload: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

emailMessageSchema.index({ userId: 1, threadId: 1, createdAt: 1 });
emailMessageSchema.index({ userId: 1, direction: 1, status: 1, readAt: 1 });
emailMessageSchema.index({ provider: 1, providerMessageId: 1 });

export default mongoose.model("EmailMessage", emailMessageSchema);
