import mongoose from "mongoose";

// One row per resolved+executed billable action. Captures which mode actually ran, what was
// charged, and whether an explicit mode-switch occurred, so usage/billing can be reconstructed
// without re-deriving it from the call logs.
const usageLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: { type: String, default: "voice_call", index: true },
    mode: { type: String, enum: ["platform_credits", "byok", "blocked"], required: true },
    success: { type: Boolean, default: false },
    cost: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    creditsCharged: { type: Number, default: 0 },
    modeSwitched: { type: Boolean, default: false },
    switchReason: { type: String, default: null },
    integrationId: { type: mongoose.Schema.Types.ObjectId, ref: "UserIntegration", default: null },
    callId: { type: String, default: null, index: true },
    error: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model("UsageLog", usageLogSchema);
