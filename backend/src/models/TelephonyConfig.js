import mongoose from "mongoose";

const telephonyConfigSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    provider: { type: String, enum: ["twilio", "exotel", "vonage"], required: true },
    phoneNumber: { type: String, required: true, index: true },
    accountSid: String,
    authToken: String,
    apiKey: String,
    apiSecret: String,
    appId: String,
    region: String,
    country: String,
    webhookUrl: String,
    inboundEnabled: { type: Boolean, default: true },
    inboundMode: {
      type: String,
      enum: ["agent_runtime", "static_greeting", "disabled"],
      default: "agent_runtime",
      index: true
    },
    outboundEnabled: { type: Boolean, default: true },
    inboundRoutingStatus: {
      type: String,
      enum: ["not_configured", "pending", "verified", "failed", "provider_managed"],
      default: "not_configured"
    },
    inboundRoutingError: String,
    inboundRoutingVerifiedAt: Date,
    twilioVoiceUrl: String,
    twilioVoiceMethod: String,
    linkedAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      default: null,
      set: (value) => value === "" ? null : value
    },
    status: { type: String, enum: ["active", "inactive", "failed"], default: "active" }
  },
  { timestamps: true }
);

telephonyConfigSchema.index(
  { provider: 1, phoneNumber: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);

export default mongoose.model("TelephonyConfig", telephonyConfigSchema);
