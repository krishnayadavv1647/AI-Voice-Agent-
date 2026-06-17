import mongoose from "mongoose";

const dograhAgentMigrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },

    sourceConnectionType: { type: String, enum: ["platform", "user_integration"], required: true },
    sourceIntegrationId: { type: mongoose.Schema.Types.ObjectId, ref: "UserIntegration", default: null },
    sourceWorkflowId: { type: String, default: "" },
    sourceWorkflowUuid: { type: String, default: "" },

    targetConnectionType: { type: String, enum: ["platform", "user_integration"], required: true },
    targetIntegrationId: { type: mongoose.Schema.Types.ObjectId, ref: "UserIntegration", default: null },
    targetWorkflowId: { type: String, default: "" },
    targetWorkflowUuid: { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "exporting", "creating_target", "syncing_models", "verifying", "completed", "failed"],
      default: "pending",
      index: true
    },
    errorSafeMessage: { type: String, default: "" },
    completedAt: Date
  },
  { timestamps: true }
);

dograhAgentMigrationSchema.index(
  { agentId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["pending", "exporting", "creating_target", "syncing_models", "verifying"] } } }
);

export default mongoose.model("DograhAgentMigration", dograhAgentMigrationSchema);
