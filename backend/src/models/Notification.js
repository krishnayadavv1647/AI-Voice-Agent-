import mongoose from "mongoose";

// Lightweight in-app notification feed. Used by the billing/BYOK layer to surface events the
// user must act on (e.g. their Dograh key was auto-deactivated after repeated failures).
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    read: { type: Boolean, default: false, index: true },
    // Optional key to avoid spamming the feed with duplicates for the same logical event.
    dedupeKey: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model("Notification", notificationSchema);
