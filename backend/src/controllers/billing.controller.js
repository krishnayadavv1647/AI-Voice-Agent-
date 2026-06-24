import Payment from "../models/Payment.js";
import User from "../models/User.js";
import { getPlan, getTopupPack, listPlans, listTopupPacks, planLimits } from "../config/plans.js";
import ledger from "../services/billing/creditLedger.service.js";
import { activeProviderName, getPaymentProvider, getProviderByName } from "../services/payments/index.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Idempotent: credits the wallet once for a paid order and (for plan purchases) activates the
// plan. Safe to call from both the webhook and the client verify handshake, and to replay.
async function grantPurchase(payment, providerPaymentId) {
  if (payment.status === "paid") return payment;

  if (providerPaymentId) payment.providerPaymentId = providerPaymentId;
  const grantKey = `pay:${payment.provider}:${payment.providerPaymentId || payment._id}`;

  await ledger.topup({
    userId: payment.userId,
    amount: payment.credits,
    idempotencyKey: grantKey,
    metadata: { paymentId: String(payment._id), type: payment.type, planKey: payment.planKey, packKey: payment.packKey }
  });

  if (payment.type === "plan" && payment.planKey) {
    const user = await User.findById(payment.userId);
    if (user) {
      user.plan = payment.planKey;
      user.planStatus = "active";
      user.planStartedAt = new Date();
      user.limits = { ...(user.limits || {}), ...planLimits(payment.planKey) };
      await user.save();
    }
  }

  payment.status = "paid";
  payment.grantedAt = new Date();
  await payment.save();
  return payment;
}

// GET /api/billing/plans
export const getBillingOverview = asyncHandler(async (req, res) => {
  const [user, balance] = await Promise.all([
    User.findById(req.user._id).select("plan planStatus planStartedAt"),
    ledger.getBalance(req.user._id)
  ]);
  res.json({
    provider: activeProviderName(),
    plans: listPlans(),
    topupPacks: listTopupPacks(),
    currentPlan: user?.plan || null,
    planStatus: user?.planStatus || "inactive",
    balance
  });
});

// POST /api/billing/checkout  { type: "plan"|"topup", key }
export const createCheckout = asyncHandler(async (req, res) => {
  const { type, key } = req.body || {};
  let item = null;
  let planKey = null;
  let packKey = null;
  if (type === "plan") { item = getPlan(key); planKey = key; }
  else if (type === "topup") { item = getTopupPack(key); packKey = key; }
  else throw new ApiError(400, "type must be 'plan' or 'topup'.");
  if (!item) throw new ApiError(400, "Unknown plan or pack.");

  const provider = getPaymentProvider();
  const amount = provider.currency === "INR" ? item.priceInr : item.priceUsd;

  const payment = await Payment.create({
    userId: req.user._id, provider: provider.name, type, planKey, packKey,
    credits: item.credits, amount, currency: provider.currency, status: "created"
  });

  const order = await provider.createOrder({
    amount, label: item.label, receipt: String(payment._id),
    metadata: { paymentId: String(payment._id), userId: String(req.user._id), type, key }
  });
  payment.providerOrderId = order.providerOrderId;
  await payment.save();

  res.json({ paymentId: payment._id, provider: provider.name, clientPayload: order.clientPayload });
});

// POST /api/billing/verify  (Razorpay client success handshake)
export const verifyCheckout = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  const provider = getPaymentProvider("razorpay");
  const verdict = provider.verifyCheckoutSignature({
    orderId: razorpay_order_id, paymentId: razorpay_payment_id, signature: razorpay_signature
  });
  if (!verdict.ok) throw new ApiError(400, "Payment verification failed.");

  const payment = await Payment.findOne({ providerOrderId: razorpay_order_id, userId: req.user._id });
  if (!payment) throw new ApiError(404, "Payment not found.");

  await grantPurchase(payment, razorpay_payment_id);
  const balance = await ledger.getBalance(req.user._id);
  res.json({ ok: true, balance, plan: payment.planKey || null });
});

// POST /api/billing/webhook/:provider  — RAW body (mounted in app.js before express.json).
// Not wrapped in asyncHandler so it can own the response codes the providers expect.
export async function handleBillingWebhook(req, res) {
  try {
    const provider = getProviderByName(req.params.provider);
    if (!provider) return res.status(404).json({ ok: false });

    const result = await provider.verifyWebhook({ rawBody: req.body, headers: req.headers });
    if (!result.ok) return res.status(400).json({ ok: false });

    if (result.event?.status === "paid") {
      const payment = await Payment.findOne({ provider: provider.name, providerOrderId: result.event.orderId });
      if (payment) await grantPurchase(payment, result.event.paymentId);
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("[billing] webhook processing failed:", error.message);
    return res.status(500).json({ ok: false });
  }
}

export default { getBillingOverview, createCheckout, verifyCheckout, handleBillingWebhook };
