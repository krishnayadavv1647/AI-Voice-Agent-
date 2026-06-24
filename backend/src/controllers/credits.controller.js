import CreditTransaction from "../models/CreditTransaction.js";
import UsageLog from "../models/UsageLog.js";
import { listPricing } from "../config/creditPricing.js";
import ledger from "../services/billing/creditLedger.service.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// GET /api/credits — everything the Credits screen renders: balance, ledger, usage, pricing.
export const getCredits = asyncHandler(async (req, res) => {
  const wallet = await ledger.ensureWallet(req.user._id);
  const [transactions, usage] = await Promise.all([
    CreditTransaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(25).lean(),
    UsageLog.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(25).lean()
  ]);

  res.json({
    balance: wallet.balance,
    reserved: wallet.reserved,
    currency: wallet.currency,
    pricing: listPricing(),
    transactions,
    usage
  });
});

// POST /api/credits/topup — add credits. Self-service top-up is gated: admins always may, and
// for demos set ALLOW_DEMO_TOPUP=true. This is NOT a real payment; it just credits the wallet so
// the credit flow can be demonstrated on screen.
export const topupCredits = asyncHandler(async (req, res) => {
  const isAdmin = ["admin", "super_admin"].includes(req.user.role);
  const demoAllowed = process.env.ALLOW_DEMO_TOPUP === "true";
  if (!isAdmin && !demoAllowed) {
    throw new ApiError(403, "Self top-up is disabled. Set ALLOW_DEMO_TOPUP=true for demos, or ask an admin.", {
      code: "TOPUP_DISABLED"
    });
  }

  const amount = Math.min(1_000_000, Math.max(1, Math.floor(Number(req.body.amount) || 100)));
  const result = await ledger.topup({
    userId: req.user._id,
    amount,
    metadata: { source: isAdmin ? "admin" : "demo" }
  });
  if (!result.ok) throw new ApiError(400, "Could not add credits.");

  res.json({ ok: true, added: amount, balance: result.balanceAfter });
});

export default { getCredits, topupCredits };
