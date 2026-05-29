import mongoose from "mongoose";

const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, default: "dograh", index: true },
    eventType: String,
    payload: { type: mongoose.Schema.Types.Mixed },
    matchedAgentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent" },
    matchedCallLogId: { type: mongoose.Schema.Types.ObjectId, ref: "CallLog" }
  },
  { timestamps: true }
);

export default mongoose.model("WebhookEvent", webhookEventSchema);
