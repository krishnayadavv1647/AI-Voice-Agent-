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
    // Gmail becomes the active outbound provider after a successful Gmail connection.
    // "brevo" is preserved only for rollback and is hidden from the normal UI.
    outboundProvider: { type: String, enum: ["gmail", "brevo"], default: "brevo" },
    // --- Legacy Brevo state (kept for rollback; not used once Gmail is connected) ---
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
    // gmail_oauth is the active inbound provider once Gmail is connected. "imap" preserved for rollback.
    inboundProvider: { type: String, enum: ["gmail_oauth", "imap"], default: "imap" },
    inbound: {
      // --- Legacy IMAP fields (kept for rollback) ---
      email: String,
      host: String,
      port: { type: Number, default: 993 },
      secure: { type: Boolean, default: true },
      username: String,
      passwordEncrypted: String,
      // Older Gmail-OAuth-on-inbound fields (superseded by the dedicated `gmail` object below,
      // but preserved so existing records keep decrypting/validating).
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
    // --- Gmail connection state. Tokens are always stored encrypted, never in plain text. ---
    gmail: {
      email: { type: String, default: "" },
      displayName: { type: String, default: "" },
      providerAccountId: { type: String, default: "" },
      accessTokenEncrypted: { type: String, default: "" },
      refreshTokenEncrypted: { type: String, default: "" },
      tokenExpiresAt: Date,
      grantedScopes: { type: [String], default: undefined },
      gmailHistoryId: { type: String, default: "" },
      gmailNextPageToken: { type: String, default: "" },
      gmailInitialSyncComplete: { type: Boolean, default: false },
      gmailLastFullSyncAt: Date,
      gmailWatchExpiration: Date,
      connected: { type: Boolean, default: false },
      connectedAt: Date,
      lastValidatedAt: Date,
      lastSyncedAt: Date,
      syncEnabled: { type: Boolean, default: true },
      syncStatus: {
        type: String,
        enum: ["not_connected", "idle", "syncing", "error", "paused"],
        default: "not_connected"
      },
      // Coarse error class so workers/UI can react without leaking Google internals.
      // "" | "auth" (needs reconnect) | "rate_limit" | "temporary"
      lastErrorType: { type: String, default: "" },
      lastError: { type: String, default: "" }
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
