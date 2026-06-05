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
    outboundEnabled: { type: Boolean, default: true },
    dograhTelephonyConfigId: String,
    dograhPhoneNumberId: String,
    dograhProviderSync: { type: mongoose.Schema.Types.Mixed },
    dograhRawResponse: { type: mongoose.Schema.Types.Mixed },
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

export default mongoose.model("TelephonyConfig", telephonyConfigSchema);
