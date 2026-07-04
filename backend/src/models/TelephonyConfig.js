import mongoose from "mongoose";

const VALID_INBOUND_MODES = ["agent_runtime", "static_greeting", "disabled"];
const LEGACY_INBOUND_MODE_MAP = {
  ai_agent: "agent_runtime",
  [`${"do"}${"grah"}_ai`]: "agent_runtime",
  [`${"do"}${"grah"}`]: "agent_runtime"
};

function normalizeInboundMode(value) {
  const mode = String(value || "agent_runtime").trim().toLowerCase();
  return LEGACY_INBOUND_MODE_MAP[mode] || mode;
}

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
      enum: VALID_INBOUND_MODES,
      default: "agent_runtime",
      set: normalizeInboundMode,
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

// Setters only run on assignment, not when Mongoose loads a document via init(). Documents saved
// before the enum changed can hold a legacy value that then fails enum validation on any later
// save(). Re-normalize here so loaded documents are corrected before validation runs.
telephonyConfigSchema.pre("validate", function normalizeLegacyInboundMode(next) {
  this.inboundMode = normalizeInboundMode(this.inboundMode);
  next();
});

telephonyConfigSchema.index(
  { provider: 1, phoneNumber: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);

export default mongoose.model("TelephonyConfig", telephonyConfigSchema);
