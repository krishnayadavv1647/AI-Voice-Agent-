import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailCampaign", index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead" },
    toEmail: { type: String, required: true },
    subject: String,
    body: String,
    provider: String,
    providerMessageId: String,
    status: { type: String, enum: ["sent", "failed", "skipped"], required: true },
    error: String,
    sentAt: Date
  },
  { timestamps: true }
);

export default mongoose.model("EmailLog", emailLogSchema);
