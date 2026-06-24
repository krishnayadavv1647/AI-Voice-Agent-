import mongoose from "mongoose";

// One row per purchase attempt (plan upgrade or credit top-up). The provider order is created
// up front (status "created"); the provider webhook (or client verify) flips it to "paid" and
// triggers the idempotent credit grant. providerPaymentId is the dedupe anchor for the grant.
const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, enum: ["razorpay", "stripe"], required: true },
    type: { type: String, enum: ["plan", "topup"], required: true },
    planKey: { type: String, default: null },
    packKey: { type: String, default: null },
    credits: { type: Number, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    providerOrderId: { type: String, default: null, index: true },
    providerPaymentId: { type: String, default: null },
    status: { type: String, enum: ["created", "paid", "failed"], default: "created", index: true },
    grantedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);
