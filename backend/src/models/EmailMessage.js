import mongoose from "mongoose";

const emailMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    emailIntegrationId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailIntegration", index: true },
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailThread", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailCampaign", index: true },
    direction: { type: String, enum: ["outbound", "inbound"], required: true, index: true },
    fromEmail: { type: String, default: "" },
    toEmail: { type: String, default: "" },
    from: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    to: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    cc: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    bcc: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    html: { type: String, default: "" },
    text: { type: String, default: "" },
    htmlBody: { type: String, default: "" },
    textBody: { type: String, default: "" },
    provider: { type: String, default: "" },
    providerMessageId: { type: String, default: "" },
    providerThreadId: { type: String, default: "" },
    internetMessageId: { type: String, default: undefined },
    inReplyTo: { type: String, default: "" },
    references: { type: [String], default: undefined },
    receivedAt: Date,
    sentAt: Date,
    readAt: Date,
    isRead: { type: Boolean, default: false, index: true },
    imapUid: { type: Number, index: true },
    imapUidValidity: { type: String, index: true },
    status: { type: String, enum: ["sent", "delivered", "failed", "received", "read", ""], default: "" },
    rawPayload: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

emailMessageSchema.index({ userId: 1, threadId: 1, createdAt: 1 });
emailMessageSchema.index({ userId: 1, direction: 1, status: 1, readAt: 1 });
emailMessageSchema.index({ provider: 1, providerMessageId: 1 });
emailMessageSchema.index(
  { emailIntegrationId: 1, imapUidValidity: 1, imapUid: 1 },
  { unique: true, partialFilterExpression: { emailIntegrationId: { $exists: true }, imapUidValidity: { $exists: true }, imapUid: { $exists: true } } }
);
emailMessageSchema.index(
  { userId: 1, internetMessageId: 1 },
  { unique: true, partialFilterExpression: { internetMessageId: { $exists: true, $ne: "" } } }
);

export default mongoose.model("EmailMessage", emailMessageSchema);
