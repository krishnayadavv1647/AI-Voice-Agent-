import mongoose from "mongoose";

const telegramConnectionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    telegramChatId: { type: String, index: true },
    telegramUsername: String,
    connectCode: { type: String, index: true },
    status: { type: String, enum: ["pending", "connected", "revoked"], default: "pending", index: true },
    dailySummaryEnabled: { type: Boolean, default: false },
    appointmentBookedEnabled: { type: Boolean, default: false },
    hotLeadEnabled: { type: Boolean, default: false },
    callFailedEnabled: { type: Boolean, default: false },
    connectedAt: Date,
    revokedAt: Date
  },
  { timestamps: true }
);

telegramConnectionSchema.index({ userId: 1, status: 1 });
telegramConnectionSchema.index({ connectCode: 1, status: 1 });

export default mongoose.model("TelegramConnection", telegramConnectionSchema);
