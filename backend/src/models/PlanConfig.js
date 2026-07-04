import mongoose from "mongoose";

const planOverrideSchema = new mongoose.Schema({
  credits: Number,
  priceInr: Number,
  priceUsd: Number,
  features: [String],
  limits: {
    maxAgents: Number,
    maxCallsPerMonth: Number,
    maxEmailsPerMonth: Number,
    maxLeadSearchesPerMonth: Number
  }
}, { _id: false });

const packOverrideSchema = new mongoose.Schema({
  credits: Number,
  priceInr: Number,
  priceUsd: Number
}, { _id: false });

const actionPricingSchema = new mongoose.Schema({
  platform: Number,
  byok: Number
}, { _id: false });

const planConfigSchema = new mongoose.Schema({
  key: { type: String, default: "global", unique: true },
  plans: {
    starter: planOverrideSchema,
    growth: planOverrideSchema,
    scale: planOverrideSchema
  },
  topupPacks: {
    tp_500: packOverrideSchema,
    tp_2000: packOverrideSchema,
    tp_5000: packOverrideSchema
  },
  creditPricing: {
    voice_call: actionPricingSchema,
    email_send: actionPricingSchema,
    lead_search: actionPricingSchema,
    appointment_book: actionPricingSchema,
    image_generate: actionPricingSchema
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

export default mongoose.model("PlanConfig", planConfigSchema);
