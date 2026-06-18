import mongoose from "mongoose";

const emailIntegrationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    outboundProvider: { type: String, enum: ["brevo"], default: "brevo" },
    brevo: {
      apiKeyEncrypted: String,
      accountEmail: String,
      senderName: String,
      senderEmail: String,
      senderId: String,
      replyToName: String,
      replyToEmail: String,
      verifiedSenders: [{
        id: String,
        name: String,
        email: String,
        active: Boolean
      }],
      connected: { type: Boolean, default: false },
      connectedAt: Date,
      lastValidatedAt: Date,
      lastError: String
    },
    inboundProvider: { type: String, enum: ["gmail_oauth", "imap"], default: "imap" },
    inbound: {
      email: String,
      host: String,
      port: { type: Number, default: 993 },
      secure: { type: Boolean, default: true },
      username: String,
      passwordEncrypted: String,
      accessTokenEncrypted: String,
      refreshTokenEncrypted: String,
      tokenExpiresAt: Date,
      mailbox: { type: String, default: "INBOX" },
      connected: { type: Boolean, default: false },
      connectedAt: Date,
      lastValidatedAt: Date,
      lastSyncedAt: Date,
      lastUid: { type: Number, default: 0 },
      uidValidity: String,
      syncEnabled: { type: Boolean, default: true },
      syncStatus: {
        type: String,
        enum: ["not_connected", "idle", "syncing", "error", "paused"],
        default: "not_connected"
      },
      lastError: String
    },
    settings: {
      autoSync: { type: Boolean, default: true },
      syncIntervalSeconds: { type: Number, default: 60 },
      markFetchedAsRead: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

emailIntegrationSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model("EmailIntegration", emailIntegrationSchema);
