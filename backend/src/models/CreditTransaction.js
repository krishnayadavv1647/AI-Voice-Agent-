import mongoose from "mongoose";

// Append-mostly ledger of every credit movement. `idempotencyKey` is unique so that a
// retried call (same logical operation) never double-charges or double-reserves: callers
// build distinct keys per phase and per mode (e.g. "<callId>:platform_credits:reserve"
// vs "<callId>:byok:fee") so a fallback mode-switch within one call stays unambiguous.
const creditTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: { type: String, default: "voice_call" },
    mode: { type: String, enum: ["platform_credits", "byok", "system"], default: "platform_credits" },
    // reserve/confirm/release drive the two-phase platform-credit flow; charge is a single
    // immediate debit (e.g. the BYOK platform fee); topup/refund credit the wallet.
    type: { type: String, enum: ["reserve", "confirm", "release", "charge", "refund", "topup"], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, default: null },
    reservedAfter: { type: Number, default: null },
    status: { type: String, enum: ["reserved", "confirmed", "released", "charged"], required: true },
    idempotencyKey: { type: String, required: true, unique: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model("CreditTransaction", creditTransactionSchema);
