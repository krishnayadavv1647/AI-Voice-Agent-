import mongoose from "mongoose";

const { Schema } = mongoose;

const PlanChangeLogSchema = new Schema(
  {
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", index: true },
    action: {
      type: String,
      enum: ["created", "edited", "archived", "restored", "assigned", "unassigned", "user_migrated"],
      required: true,
    },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    diff: mongoose.Schema.Types.Mixed,
    affectedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: String,
  },
  { timestamps: true }
);

export default mongoose.model("PlanChangeLog", PlanChangeLogSchema);
