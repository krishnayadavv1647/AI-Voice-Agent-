import mongoose from "mongoose";

const userIntegrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, enum: ["dograh"], required: true, index: true },
    status: { type: String, enum: ["connected", "disconnected", "failed"], default: "disconnected", index: true },
    apiKeyEncrypted: { type: String, default: "" },
    baseUrl: { type: String, default: "" },
    workspaceId: { type: String, default: "" },
    accountEmail: { type: String, default: "" },
    lastTestedAt: Date,
    lastError: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

userIntegrationSchema.index({ userId: 1, provider: 1 }, { unique: true });

export default mongoose.model("UserIntegration", userIntegrationSchema);
