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
    transcript: String,
    duration: { type: Number, default: 0 },
    recordingUrl: String,
    transcriptUrl: String,
    summary: String,
    status: String,
    leadCaptured: { type: Boolean, default: false },
    leadData: { type: mongoose.Schema.Types.Mixed },
    rawDograhPayload: { type: mongoose.Schema.Types.Mixed },
    startedAt: Date,
    endedAt: Date
  },
  { timestamps: true }
);

export default mongoose.model("CallLog", callLogSchema);
