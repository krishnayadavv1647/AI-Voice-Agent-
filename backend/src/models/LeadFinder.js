import mongoose from "mongoose";

const leadFinderLeadSchema = new mongoose.Schema(
  {
    businessName: String,
    contactName: String,
    phone: String,
    email: String,
    emails: [String],
    emailSourceUrl: String,
    emailEnrichmentStatus: {
      type: String,
      enum: ["not_started", "found", "not_found", "failed"],
      default: "not_started"
    },
    emailEnrichmentError: String,
    emailEnrichedAt: Date,
    website: String,
    city: String,
    address: String,
    country: String,
    category: String,
    industry: String,
    googleMapsUrl: String,
    instagramUrl: String,
    facebookUrl: String,
    linkedinUrl: String,
    source: String,
    savedLeadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead" },
    savedAt: Date
  },
  { _id: true }
);

const leadFinderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    query: String,
    category: String,
    keyword: String,
    city: String,
    country: String,
    totalRequested: { type: Number, default: 25 },
    totalFound: { type: Number, default: 0 },
    provider: { type: String, default: "mock" },
    status: { type: String, enum: ["pending", "running", "completed", "failed"], default: "pending" },
    error: String,
    leadsPreview: [leadFinderLeadSchema]
  },
  { timestamps: true }
);

export default mongoose.model("LeadFinder", leadFinderSchema);
