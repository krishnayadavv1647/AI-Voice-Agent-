import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", index: true },
    dograhAgentId: String,
    dograhWorkflowId: String,
    dograhWorkflowUuid: String,
    dograhRunId: String,
    callerNumber: String,
    callingNumber: String,
    callDirection: String,
    source: String,
    transcript: String,
    duration: String,
    durationSeconds: Number,
    recordingUrl: String,
    transcriptUrl: String,
    summary: String,
    status: String,
    leadCaptured: { type: Boolean, default: false },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead" },
    leadData: { type: mongoose.Schema.Types.Mixed },
    rawDograhPayload: { type: mongoose.Schema.Types.Mixed },
    rawWebhookPayload: { type: mongoose.Schema.Types.Mixed },
    rawRunDetails: { type: mongoose.Schema.Types.Mixed },
    startedAt: Date,
    endedAt: Date
  },
  { timestamps: true }
);

export default mongoose.model("CallLog", callLogSchema);
