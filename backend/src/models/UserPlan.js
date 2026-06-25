import mongoose from "mongoose";

const { Schema } = mongoose;

// Tracks which catalog Plan a user is currently on.
// Parallel to User.plan (the legacy string field) — does NOT replace it.
// The credit/limit enforcement engine reads limitsSnapshot, not Plan directly,
// so edits to Plan only take effect on a user at their next cycle renewal
// (or immediately if admin checked "apply immediately").
const UserPlanSchema = new Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true, index: true },
    status: { type: String, enum: ["active", "expired", "cancelled"], default: "active" },
    // Snapshot of limits/credits at assignment time — source of truth for enforcement this cycle.
    limitsSnapshot: {
      maxAgents: Number,
      maxContacts: Number,
      maxCampaigns: Number,
      callsPerDay: Number,
      emailsPerDay: Number,
      teamMembers: Number,
      actionsPerMin: Number,
    },
    monthlyCreditsSnapshot: Number,
    rolloverSnapshot: Boolean,
    cycleStart: Date,
    cycleEnd: Date,
  },
  { timestamps: true }
);

export default mongoose.model("UserPlan", UserPlanSchema);
