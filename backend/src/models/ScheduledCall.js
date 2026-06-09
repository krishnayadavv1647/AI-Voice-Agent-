import mongoose from "mongoose";

const scheduledCallSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    phoneNumber: { type: String, required: true },
    scheduledForUtc: { type: Date, required: true, index: true },
    timezone: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "cancelled", "failed"],
      default: "pending",
      index: true
    },
    attempts: { type: Number, default: 0 },
    lastError: String,
    callLogId: { type: mongoose.Schema.Types.ObjectId, ref: "CallLog" },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead" },
    importRunId: { type: mongoose.Schema.Types.ObjectId, ref: "ImportRun" },
    source: String,
    purpose: String,
    notes: String,
    processedAt: Date
  },
  { timestamps: true }
);

scheduledCallSchema.index({ status: 1, scheduledForUtc: 1 });

export default mongoose.model("ScheduledCall", scheduledCallSchema);
