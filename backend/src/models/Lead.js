import mongoose from "mongoose";

const noteSchema = new mongoose.Schema(
  {
    text: String,
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const leadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    callLogId: { type: mongoose.Schema.Types.ObjectId, ref: "CallLog" },
    businessName: String,
    contactName: String,
    name: String,
    phone: String,
    email: String,
    emails: [String],
    emailUnsubscribed: { type: Boolean, default: false },
    emailUnsubscribedAt: Date,
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
    requirement: String,
    preferredDate: String,
    preferredTime: String,
    budget: String,
    location: String,
    message: String,
    customFields: { type: mongoose.Schema.Types.Mixed },
    source: String,
    status: {
      type: String,
      enum: [
        "New",
        "Contacted",
        "Interested",
        "Booked",
        "Closed",
        "Not Interested",
        "new",
        "contacted",
        "interested",
        "follow_up",
        "appointment_booked",
        "not_interested",
        "lost",
        "unable_to_reach"
      ],
      default: "New"
    },
    notes: [noteSchema]
  },
  { timestamps: true }
);

leadSchema.index({ userId: 1, phone: 1 });
leadSchema.index({ userId: 1, email: 1 });
leadSchema.index({ userId: 1, website: 1 });

export default mongoose.model("Lead", leadSchema);
