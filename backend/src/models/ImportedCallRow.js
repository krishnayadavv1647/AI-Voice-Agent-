import mongoose from "mongoose";

const importedCallRowSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    importRunId: { type: mongoose.Schema.Types.ObjectId, ref: "ImportRun", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead" },
    scheduledCallId: { type: mongoose.Schema.Types.ObjectId, ref: "ScheduledCall" },
    name: String,
    phone: String,
    email: String,
    city: String,
    callDate: String,
    callTime: String,
    timezone: String,
    startAt: Date,
    purpose: String,
    notes: String,
    status: { type: String, enum: ["valid", "invalid", "imported", "skipped"], default: "invalid", index: true },
    error: String,
    raw: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

importedCallRowSchema.index({ importRunId: 1, status: 1 });
importedCallRowSchema.index({ userId: 1, agentId: 1, phone: 1, startAt: 1 });

export default mongoose.model("ImportedCallRow", importedCallRowSchema);
