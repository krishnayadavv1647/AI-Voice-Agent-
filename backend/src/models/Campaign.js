import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["call"], default: "call" },
    status: {
      type: String,
      enum: ["draft", "scheduled", "running", "paused", "completed", "failed", "cancelled"],
      default: "draft",
      index: true
    },
    startAt: Date,
    timezone: { type: String, default: "Asia/Kolkata" },
    callingSpeed: {
      batchSize: { type: Number, default: 5 },
      delaySeconds: { type: Number, default: 10 },
      maxParallelCalls: { type: Number, default: 3 }
    },
    retryRules: {
      enabled: { type: Boolean, default: true },
      maxAttempts: { type: Number, default: 3 },
      retryDelayMinutes: { type: Number, default: 120 },
      retryOnStatuses: {
        type: [String],
        default: ["no_answer", "busy", "failed", "declined"]
      }
    },
    stats: {
      totalRecipients: { type: Number, default: 0 },
      queued: { type: Number, default: 0 },
      running: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      answered: { type: Number, default: 0 },
      noAnswer: { type: Number, default: 0 },
      busy: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      declined: { type: Number, default: 0 },
      appointmentsBooked: { type: Number, default: 0 },
      leadsCaptured: { type: Number, default: 0 }
    },
    startedAt: Date,
    completedAt: Date
  },
  { timestamps: true }
);

campaignSchema.index({ userId: 1, status: 1, createdAt: -1 });
// Campaigns list filters by userId and sorts by createdAt desc (no status filter), which the
// status-first compound above can't serve for the sort.
campaignSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Campaign", campaignSchema);
