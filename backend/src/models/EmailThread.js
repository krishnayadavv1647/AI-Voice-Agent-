import mongoose from "mongoose";

const emailThreadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailCampaign", index: true },
    subject: { type: String, default: "" },
    normalizedSubject: { type: String, default: "", index: true },
    fromEmail: { type: String, default: "" },
    toEmail: { type: String, default: "" },
    replyToEmail: { type: String, default: "", index: true },
    status: { type: String, enum: ["open", "unread", "needs_reply", "replied", "closed"], default: "open", index: true },
    lastMessageAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

emailThreadSchema.index({ userId: 1, leadId: 1, campaignId: 1 });
emailThreadSchema.index({ userId: 1, subject: 1 });
emailThreadSchema.index({ userId: 1, normalizedSubject: 1, toEmail: 1 });

export default mongoose.model("EmailThread", emailThreadSchema);
