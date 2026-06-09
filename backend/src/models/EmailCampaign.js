import mongoose from "mongoose";

const emailCampaignSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    name: { type: String, required: true },
    subject: String,
    body: String,
    selectedLeadIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Lead" }],
    status: { type: String, enum: ["draft", "sending", "sent", "partially_sent", "failed"], default: "draft" },
    totalRecipients: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model("EmailCampaign", emailCampaignSchema);
