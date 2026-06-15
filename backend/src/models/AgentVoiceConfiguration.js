import mongoose from "mongoose";

const agentVoiceConfigurationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, unique: true, index: true },

    sttIntegrationId: { type: mongoose.Schema.Types.ObjectId, ref: "VoiceIntegration", default: null },
    sttProvider: { type: String, default: "dograh_default" },
    sttModel: { type: String, default: "" },
    sttLanguage: { type: String, default: "en" },
    sttSettings: { type: mongoose.Schema.Types.Mixed, default: {} },

    ttsIntegrationId: { type: mongoose.Schema.Types.ObjectId, ref: "VoiceIntegration", default: null },
    ttsProvider: { type: String, default: "dograh_default" },
    ttsModel: { type: String, default: "" },
    ttsVoiceId: { type: String, default: "" },
    ttsLanguage: { type: String, default: "en" },
    ttsSettings: { type: mongoose.Schema.Types.Mixed, default: {} },

    dograhSyncStatus: {
      type: String,
      enum: ["not_configured", "pending", "syncing", "synced", "configuration_required", "failed"],
      default: "not_configured"
    },
    dograhLastSyncedAt: { type: Date, default: null },
    dograhSyncError: { type: String, default: "" },
    dograhEffectiveSttProvider: { type: String, default: "" },
    dograhEffectiveSttModel: { type: String, default: "" },
    dograhEffectiveTtsProvider: { type: String, default: "" },
    dograhEffectiveTtsModel: { type: String, default: "" },
    dograhEffectiveTtsVoiceId: { type: String, default: "" }
  },
  { timestamps: true }
);

export default mongoose.model("AgentVoiceConfiguration", agentVoiceConfigurationSchema);
