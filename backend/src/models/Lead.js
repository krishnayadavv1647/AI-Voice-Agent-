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
    name: String,
    phone: String,
    email: String,
    requirement: String,
    preferredDate: String,
    preferredTime: String,
    budget: String,
    location: String,
    message: String,
    customFields: { type: Map, of: String },
    status: { type: String, enum: ["New", "Contacted", "Interested", "Closed", "Not Interested"], default: "New" },
    notes: [noteSchema]
  },
  { timestamps: true }
);

export default mongoose.model("Lead", leadSchema);
