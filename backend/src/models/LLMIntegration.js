import mongoose from "mongoose";
import { EXTERNAL_LLM_PROVIDERS, normalizeLLMProvider } from "../services/llmProviders/providerIdentity.service.js";

const llmIntegrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: {
      type: String,
      enum: EXTERNAL_LLM_PROVIDERS,
      required: true,
      set: (value) => normalizeLLMProvider(value, { allowDefault: false })
    },
    connectionName: { type: String, required: true, trim: true, maxlength: 120 },
    encryptedCredentials: { type: String, required: true, select: false },
    encryptionKeyVersion: { type: String, default: "v1" },
    maskedIdentifier: { type: String, default: "" },
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
    lastValidationCode: { type: String, default: "" },
    lastErrorSafeMessage: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

llmIntegrationSchema.index({ userId: 1, provider: 1, connectionName: 1 }, { unique: true });

export default mongoose.model("LLMIntegration", llmIntegrationSchema);
