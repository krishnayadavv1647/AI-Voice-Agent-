import mongoose from "mongoose";

const voiceIntegrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: {
      type: String,
      enum: ["cartesia", "elevenlabs", "deepgram"],
      required: true
    },
    apiKeyEncrypted: { type: String, required: true, select: false },
    keyLastFour: { type: String, default: "" },
    credentialStatus: {
      type: String,
      enum: ["not_connected", "validating", "connected", "invalid", "expired"],
      default: "not_connected"
    },
    runtimeStatus: {
      type: String,
      enum: ["supported", "unsupported", "configuration_required", "sync_failed"],
      default: "configuration_required"
    },
    lastValidatedAt: { type: Date, default: null },
    lastErrorSafeMessage: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

voiceIntegrationSchema.index({ userId: 1, provider: 1 }, { unique: true });

export default mongoose.model("VoiceIntegration", voiceIntegrationSchema);
