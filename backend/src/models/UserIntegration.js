import mongoose from "mongoose";

const userIntegrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, enum: ["dograh"], required: true, index: true },
    connectionName: { type: String, default: "My Dograh" },
    deploymentType: { type: String, enum: ["cloud", "self_hosted"], default: "cloud" },
    status: { type: String, enum: ["connected", "disconnected", "failed", "invalid", "unavailable"], default: "disconnected", index: true },
    runtimeStatus: { type: String, enum: ["available", "unavailable", "configuration_required", "unknown"], default: "unknown" },
    allowPlatformFallback: { type: Boolean, default: false },
    apiKeyEncrypted: { type: String, default: "" },
    keyLastFour: { type: String, default: "" },
    baseUrl: { type: String, default: "" },
    workspaceId: { type: String, default: "" },
    accountEmail: { type: String, default: "" },
    apiVersion: { type: String, default: "" },
    lastTestedAt: Date,
    lastValidatedAt: Date,
    lastError: { type: String, default: "" },
    lastErrorSafeMessage: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

userIntegrationSchema.index({ userId: 1, provider: 1 }, { unique: true });

export default mongoose.model("UserIntegration", userIntegrationSchema);
