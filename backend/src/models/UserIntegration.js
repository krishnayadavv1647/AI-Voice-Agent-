import mongoose from "mongoose";

const userIntegrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, enum: ["vapi"], required: true, index: true },
    connectionName: { type: String, default: "Voice provider" },
    deploymentType: { type: String, enum: ["cloud", "self_hosted"], default: "cloud" },
    status: { type: String, enum: ["connected", "disconnected", "failed", "invalid", "unavailable"], default: "disconnected", index: true },
    runtimeStatus: { type: String, enum: ["available", "unavailable", "configuration_required", "unknown"], default: "unknown" },
    allowPlatformFallback: { type: Boolean, default: false },

    // BYOK preference & fail-closed controls (see services/billing/providerResolver.service.js).
    // isActive is the runtime gate the resolver checks: a validated key is only eligible for
    // BYOK while isActive !== false. It is auto-set false after repeated failures and reset on
    // (re)connection or admin reactivation.
    isActive: { type: Boolean, default: true },
    preferOwnKey: { type: Boolean, default: false },
    fallbackOnFailure: { type: Boolean, default: false },
    consecutiveFailures: { type: Number, default: 0 },
    lastFailureAt: { type: Date, default: null },
    lastFailureReason: { type: String, default: null },
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
