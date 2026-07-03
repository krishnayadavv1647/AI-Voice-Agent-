import mongoose from "mongoose";

const callLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", index: true },
    dograhAgentId: String,
    dograhWorkflowId: String,
    dograhWorkflowUuid: String,
    dograhRunId: String,
    // Vapi-friendly equivalent of dograhRunId: the stable provider call id (message.call.id).
    // Additive; the outbound path writes this at call start once Layer C rewires it.
    providerCallId: { type: String, index: true },
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
    normalizedStatus: {
      type: String,
      enum: ["completed", "answered", "declined", "no_answer", "busy", "failed", "cancelled", "in_progress", "unknown"],
      default: "unknown",
      index: true
    },
    rawProviderStatus: String,
    providerPayload: { type: mongoose.Schema.Types.Mixed },
    outcome: String,
    callEndedAt: Date,
    retryEligible: { type: Boolean, default: false },
    retryScheduled: { type: Boolean, default: false },
    leadCaptured: { type: Boolean, default: false },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead" },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", index: true },
    campaignRecipientId: { type: mongoose.Schema.Types.ObjectId, ref: "CampaignRecipient", index: true },
    leadData: { type: mongoose.Schema.Types.Mixed },
    rawDograhPayload: { type: mongoose.Schema.Types.Mixed },
    rawWebhookPayload: { type: mongoose.Schema.Types.Mixed },
    rawRunDetails: { type: mongoose.Schema.Types.Mixed },
    startedAt: Date,
    endedAt: Date,

    // Per-minute credit billing (Phase 1). Populated only when CREDIT_ENFORCEMENT was on at call
    // start. The reservation is settled against the real durationSeconds when the call finalizes.
    billingEnforced: { type: Boolean, default: false },
    billingMode: { type: String, enum: ["platform_credits", "byok", null], default: null },
    billingCallId: { type: String, default: null },
    billingSettled: { type: Boolean, default: false },
    creditsCharged: { type: Number, default: 0 },

    // Auto-pipeline tracking (written by pipelineScheduler; never read by sync/extract logic)
    autoSyncedAt: { type: Date, default: null },
    autoSyncFailureCount: { type: Number, default: 0 },
    autoExtractedAt: { type: Date, default: null },
    autoExtractFailureCount: { type: Number, default: 0 },
    pipelineStatus: {
      type: String,
      enum: ["pending", "syncing", "synced", "extracting", "completed", "failed"],
      default: "pending"
    },
    lastPipelineError: { type: String, default: null }
  },
  { timestamps: true }
);

export default mongoose.model("CallLog", callLogSchema);
