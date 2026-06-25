import mongoose from "mongoose";

const { Schema } = mongoose;

const PlanSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    slug: { type: String, required: true, unique: true, index: true, immutable: true },
    description: { type: String, trim: true },
    badge: { type: String, trim: true },
    tier: {
      type: String,
      enum: ["trial", "starter", "growth", "scale", "pro", "agency", "enterprise", "custom"],
      default: "custom",
    },
    isCustom: { type: Boolean, default: true },
    visibility: { type: String, enum: ["public", "private"], default: "public", index: true },
    assignedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }],
    status: { type: String, enum: ["active", "archived"], default: "active", index: true },
    sortOrder: { type: Number, default: 0 },
    pricing: {
      monthlyPrice: { type: Number, default: null },
      yearlyPrice: { type: Number, default: null },
      currency: { type: String, default: "USD" },
      isContactSales: { type: Boolean, default: false },
    },
    monthlyCredits: { type: Number, required: true, default: 0 },
    rollover: { type: Boolean, default: false },
    limits: {
      maxAgents: { type: Number, default: null },
      maxContacts: { type: Number, default: null },
      maxCampaigns: { type: Number, default: null },
      callsPerDay: { type: Number, default: null },
      emailsPerDay: { type: Number, default: null },
      teamMembers: { type: Number, default: null },
      // Never null — fair-usage ceiling always enforced
      actionsPerMin: { type: Number, required: true, min: 1 },
    },
    byokAllowed: { type: Boolean, default: true },
    features: [{ type: String }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

PlanSchema.index({ visibility: 1, status: 1, sortOrder: 1 });

PlanSchema.pre("save", function (next) {
  if (this.visibility === "private" && (!this.assignedUserIds || this.assignedUserIds.length === 0)) {
    return next(new Error("Private plans must have at least one assigned user."));
  }
  if (this.visibility === "public") {
    this.assignedUserIds = [];
  }
  next();
});

export default mongoose.model("Plan", PlanSchema);
