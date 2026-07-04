import mongoose from "mongoose";

const agentVoiceConfigurationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, unique: true, index: true },

    sttIntegrationId: { type: mongoose.Schema.Types.ObjectId, ref: "VoiceIntegration", default: null },
    sttProvider: { type: String, default: "deepgram" },
    sttModel: { type: String, default: "" },
    sttLanguage: { type: String, default: "en" },
    sttSettings: { type: mongoose.Schema.Types.Mixed, default: {} },

    ttsIntegrationId: { type: mongoose.Schema.Types.ObjectId, ref: "VoiceIntegration", default: null },
    ttsProvider: { type: String, default: "elevenlabs" },
    ttsModel: { type: String, default: "" },
    ttsVoiceId: { type: String, default: "" },
    ttsLanguage: { type: String, default: "en" },
    ttsSettings: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model("AgentVoiceConfiguration", agentVoiceConfigurationSchema);
