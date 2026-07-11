import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    attachmentId: { type: String, default: "" },
    filename: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    contentId: { type: String, default: "" },
    inline: { type: Boolean, default: false }
  },
  { _id: false }
);

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
    replyTo: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    html: { type: String, default: "" },
    text: { type: String, default: "" },
    htmlBody: { type: String, default: "" },
    textBody: { type: String, default: "" },
    // provider is "gmail" for all Gmail-sourced/sent messages; "brevo"/"imap" preserved for legacy.
    provider: { type: String, default: "" },
    providerMessageId: { type: String, default: "" },
    providerThreadId: { type: String, default: "", index: true },
    internetMessageId: { type: String, default: undefined },
    inReplyTo: { type: String, default: "" },
    references: { type: [String], default: undefined },
    // Gmail-specific enrichment
    labelIds: { type: [String], default: undefined },
    snippet: { type: String, default: "" },
    gmailInternalDate: { type: Date },
    headers: { type: mongoose.Schema.Types.Mixed },
    attachments: { type: [attachmentSchema], default: undefined },
    hasAttachments: { type: Boolean, default: false },
    receivedAt: Date,
    sentAt: Date,
    readAt: Date,
    isRead: { type: Boolean, default: false, index: true },
    isStarred: { type: Boolean, default: false },
    isDraft: { type: Boolean, default: false },
    imapUid: { type: Number, index: true },
    imapUidValidity: { type: String, index: true },
    status: { type: String, enum: ["sent", "delivered", "failed", "received", "read", "draft", ""], default: "" },
    rawPayload: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

emailMessageSchema.index({ userId: 1, threadId: 1, createdAt: 1 });
emailMessageSchema.index({ userId: 1, direction: 1, status: 1, readAt: 1 });
emailMessageSchema.index({ provider: 1, providerMessageId: 1 });
emailMessageSchema.index({ userId: 1, providerThreadId: 1 });
emailMessageSchema.index(
  { emailIntegrationId: 1, imapUidValidity: 1, imapUid: 1 },
  { unique: true, partialFilterExpression: { emailIntegrationId: { $exists: true }, imapUidValidity: { $exists: true }, imapUid: { $exists: true } } }
);
emailMessageSchema.index(
  { userId: 1, internetMessageId: 1 },
  { unique: true, partialFilterExpression: { internetMessageId: { $exists: true, $ne: "" } } }
);
// Guarantees the same Gmail message is never imported twice for the same integration.
// Partial filter keeps legacy (non-provider) records from colliding on empty provider fields.
emailMessageSchema.index(
  { userId: 1, emailIntegrationId: 1, provider: 1, providerMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      emailIntegrationId: { $exists: true },
      provider: "gmail",
      providerMessageId: { $exists: true, $ne: "" }
    }
  }
);

export default mongoose.model("EmailMessage", emailMessageSchema);
