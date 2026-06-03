import mongoose from "mongoose";

const transcriptEntrySchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant", "system"], default: "user" },
    text: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now }
  },
  { _id: false }
);

const webCallSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    provider: { type: String, enum: ["dograh"], default: "dograh", index: true },
    providerCallId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ["starting", "live", "ended", "failed"],
      default: "starting",
      index: true
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
    duration: { type: Number, default: 0 },
    transcript: { type: [transcriptEntrySchema], default: [] },
    summary: String,
    recordingUrl: String,
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model("WebCall", webCallSchema);
