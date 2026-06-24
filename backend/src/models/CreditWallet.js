import mongoose from "mongoose";

// Authoritative platform-credit balance for a user. `balance` is spendable credits;
// `reserved` holds credits temporarily withheld by an in-flight two-phase reservation
// (reserve -> confirm/release). Spendable + reserved is the user's total committed credits.
const creditWalletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "credits" }
  },
  { timestamps: true }
);

export default mongoose.model("CreditWallet", creditWalletSchema);
