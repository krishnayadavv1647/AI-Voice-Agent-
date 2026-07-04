import mongoose from "mongoose";
import { CANONICAL_LLM_PROVIDERS, normalizeLLMProvider } from "../services/llmProviders/providerIdentity.service.js";
import { normalizeModelId } from "../services/llmProviders/modelClassification.service.js";

const agentLLMConfigurationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, unique: true, index: true },
    integrationId: { type: mongoose.Schema.Types.ObjectId, ref: "LLMIntegration", default: null },
    provider: {
      type: String,
      enum: CANONICAL_LLM_PROVIDERS,
      default: "google_gemini",
      set: (value) => normalizeLLMProvider(value)
    },
    model: { type: String, default: "", set: (value) => normalizeModelId(value) },
    settings: {
      temperature: { type: Number, default: 0.4 },
      maxTokens: { type: Number, default: 512 },
      topP: { type: Number, default: 1 },
      frequencyPenalty: { type: Number, default: 0 },
      presencePenalty: { type: Number, default: 0 },
      timeoutMs: { type: Number, default: 30000 },
      streaming: { type: Boolean, default: true },
      toolCalling: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

export default mongoose.model("AgentLLMConfiguration", agentLLMConfigurationSchema);
