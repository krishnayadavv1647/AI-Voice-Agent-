import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, minlength: 6 },
    googleId: { type: String, index: true },
    avatar: String,
    authProvider: { type: String, enum: ["google", "local"], default: "local" },
    role: { type: String, enum: ["user", "admin", "super_admin"], default: "user" },
    plan: { type: String, enum: ["free", "starter", "pro", "agency"], default: "free" },
    planStatus: { type: String, enum: ["active", "expired", "cancelled", "trial"], default: "active" },
    planStartedAt: Date,
    planExpiresAt: Date,
    credits: {
      callCredits: { type: Number, default: 0 },
      emailCredits: { type: Number, default: 0 },
      leadFinderCredits: { type: Number, default: 0 },
      appointmentCredits: { type: Number, default: 0 }
    },
    limits: {
      maxAgents: { type: Number, default: 1 },
      maxCallsPerMonth: { type: Number, default: 25 },
      maxEmailsPerMonth: { type: Number, default: 25 },
      maxLeadSearchesPerMonth: { type: Number, default: 10 },
      monthlyCallLimit: { type: Number, default: 25 },
      monthlyEmailLimit: { type: Number, default: 25 },
      monthlyLeadFinderLimit: { type: Number, default: 10 }
    },
    minutesUsed: { type: Number, default: 0 },
    imageGenerationsUsed: { type: Number, default: 0 },
    platformCreditsUsed: { type: Number, default: 0 },
    customApiCreditsUsed: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "suspended", "deleted"], default: "active" },
    lastLoginAt: Date,
    deletedAt: Date
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = function matchPassword(password) {
  if (!this.password) return false;
  return bcrypt.compare(password, this.password);
};

export default mongoose.model("User", userSchema);
