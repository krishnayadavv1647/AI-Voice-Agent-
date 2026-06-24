import CreditTransaction from "../../models/CreditTransaction.js";
import CreditWallet from "../../models/CreditWallet.js";
import UsageLog from "../../models/UsageLog.js";

// Default starting balance for a freshly seen wallet (e.g. trial credits). 0 by default so the
// system fails closed: a brand-new user with no top-up and no key is "blocked", never billed.
function defaultStartingBalance() {
  return Math.max(0, Number(process.env.DEFAULT_SIGNUP_CREDITS) || 0);
}

export async function ensureWallet(userId) {
  return CreditWallet.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, balance: defaultStartingBalance(), reserved: 0, currency: "credits" } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

export async function getBalance(userId) {
  const wallet = await ensureWallet(userId);
  return wallet.balance;
}

async function findByKey(idempotencyKey) {
  if (!idempotencyKey) return null;
  return CreditTransaction.findOne({ idempotencyKey });
}

// Phase 1 of the two-phase platform-credit flow. Atomically moves `amount` from spendable
// balance into the reserved hold, guarded so it can never overdraw. Idempotent on
// idempotencyKey: a replay returns the existing reservation instead of holding twice.
export async function reserve({ userId, amount, action = "dograh_call", idempotencyKey, metadata = {} }) {
  await ensureWallet(userId);
  const existing = await findByKey(idempotencyKey);
  if (existing) {
    return { ok: existing.status !== "released", reused: true, transaction: existing, amount: existing.amount };
  }

  if (!amount || amount <= 0) {
    const txn = await CreditTransaction.create({
      userId, action, mode: "platform_credits", type: "reserve",
      amount: 0, status: "reserved", idempotencyKey, metadata
    });
    return { ok: true, transaction: txn, amount: 0 };
  }

  const wallet = await CreditWallet.findOneAndUpdate(
    { userId, balance: { $gte: amount } },
    { $inc: { balance: -amount, reserved: amount } },
    { new: true }
  );
  if (!wallet) return { ok: false, reason: "INSUFFICIENT_CREDITS" };

  try {
    const txn = await CreditTransaction.create({
      userId, action, mode: "platform_credits", type: "reserve",
      amount, status: "reserved", idempotencyKey,
      balanceAfter: wallet.balance, reservedAfter: wallet.reserved, metadata
    });
    return { ok: true, transaction: txn, amount };
  } catch (error) {
    // Lost an idempotency race: undo the hold and return the winner.
    await CreditWallet.updateOne({ userId }, { $inc: { balance: amount, reserved: -amount } });
    if (error?.code === 11000) {
      const winner = await findByKey(idempotencyKey);
      return { ok: Boolean(winner) && winner.status !== "released", reused: true, transaction: winner, amount: winner?.amount || 0 };
    }
    throw error;
  }
}

// Phase 2a: the held credits are consumed. Clears the reserved hold (balance was already
// debited at reserve time) and marks the reservation confirmed. Idempotent.
export async function confirmReservation({ idempotencyKey }) {
  const txn = await findByKey(idempotencyKey);
  if (!txn) return { ok: false, reason: "RESERVATION_NOT_FOUND" };
  if (txn.status === "confirmed") return { ok: true, reused: true, transaction: txn };
  if (txn.status === "released") return { ok: false, reason: "RESERVATION_ALREADY_RELEASED" };

  if (txn.amount > 0) {
    await CreditWallet.updateOne({ userId: txn.userId }, { $inc: { reserved: -txn.amount } });
  }
  txn.status = "confirmed";
  txn.type = "confirm";
  await txn.save();
  return { ok: true, transaction: txn };
}

// Phase 2b: the call failed; return the held credits to spendable balance. No charge. Idempotent.
export async function releaseReservation({ idempotencyKey }) {
  const txn = await findByKey(idempotencyKey);
  if (!txn) return { ok: false, reason: "RESERVATION_NOT_FOUND" };
  if (txn.status === "released") return { ok: true, reused: true, transaction: txn };
  if (txn.status === "confirmed") return { ok: false, reason: "RESERVATION_ALREADY_CONFIRMED" };

  if (txn.amount > 0) {
    await CreditWallet.updateOne({ userId: txn.userId }, { $inc: { balance: txn.amount, reserved: -txn.amount } });
  }
  txn.status = "released";
  txn.type = "release";
  await txn.save();
  return { ok: true, transaction: txn };
}

// Phase 2 for metered (per-minute) calls: reconcile a reservation against the ACTUAL amount once
// it's known. Refunds any over-reserved credits to balance, or debits the shortfall when the call
// ran longer than estimated (allowNegative, since the minutes were already consumed). Idempotent.
export async function settleReservation({ idempotencyKey, actualAmount, allowNegative = true }) {
  const txn = await findByKey(idempotencyKey);
  if (!txn) return { ok: false, reason: "RESERVATION_NOT_FOUND" };
  if (txn.status === "confirmed") return { ok: true, reused: true, transaction: txn, charged: txn.amount };
  if (txn.status === "released") return { ok: false, reason: "RESERVATION_ALREADY_RELEASED" };

  const reserved = txn.amount;
  const actual = Math.max(0, Number(actualAmount) || 0);
  const inc = { reserved: -reserved };
  if (actual <= reserved) {
    inc.balance = reserved - actual; // refund the unused portion
  } else {
    inc.balance = -(actual - reserved); // debit the overage (call already happened)
  }
  if (!allowNegative && actual > reserved) {
    const wallet = await CreditWallet.findOne({ userId: txn.userId });
    if (wallet && wallet.balance < actual - reserved) {
      // Not allowed to go negative and can't cover overage: charge only what was reserved.
      inc.balance = 0;
    }
  }

  const wallet = await CreditWallet.findOneAndUpdate({ userId: txn.userId }, { $inc: inc }, { new: true });
  txn.status = "confirmed";
  txn.type = "confirm";
  txn.amount = actual;
  txn.balanceAfter = wallet?.balance ?? null;
  txn.reservedAfter = wallet?.reserved ?? null;
  await txn.save();
  return { ok: true, transaction: txn, charged: actual, balanceAfter: wallet?.balance };
}

// Single immediate debit (used for the BYOK platform fee). `allowNegative` lets a tiny,
// already-incurred fee settle even if the wallet is short — the BYOK call already happened on
// the user's key and cannot be un-rung, so we record the (possibly negative) balance truthfully
// rather than failing a completed call. Idempotent.
export async function charge({ userId, amount, action = "dograh_call", mode = "byok", idempotencyKey, allowNegative = false, metadata = {} }) {
  await ensureWallet(userId);
  const existing = await findByKey(idempotencyKey);
  if (existing) return { ok: true, reused: true, transaction: existing, amount: existing.amount };

  if (!amount || amount <= 0) {
    const txn = await CreditTransaction.create({
      userId, action, mode, type: "charge", amount: 0, status: "charged", idempotencyKey, metadata
    });
    return { ok: true, transaction: txn, amount: 0 };
  }

  const query = allowNegative ? { userId } : { userId, balance: { $gte: amount } };
  const wallet = await CreditWallet.findOneAndUpdate(query, { $inc: { balance: -amount } }, { new: true });
  if (!wallet) return { ok: false, reason: "INSUFFICIENT_CREDITS" };

  try {
    const txn = await CreditTransaction.create({
      userId, action, mode, type: "charge", amount, status: "charged",
      idempotencyKey, balanceAfter: wallet.balance, reservedAfter: wallet.reserved, metadata
    });
    return { ok: true, transaction: txn, amount, balanceAfter: wallet.balance };
  } catch (error) {
    await CreditWallet.updateOne({ userId }, { $inc: { balance: amount } });
    if (error?.code === 11000) {
      const winner = await findByKey(idempotencyKey);
      return { ok: true, reused: true, transaction: winner, amount: winner?.amount || 0 };
    }
    throw error;
  }
}

// Admin/seed helper. Credits the wallet and records a topup ledger row.
export async function topup({ userId, amount, idempotencyKey, metadata = {} }) {
  if (!amount || amount <= 0) return { ok: false, reason: "INVALID_AMOUNT" };
  await ensureWallet(userId);
  const key = idempotencyKey || `topup:${userId}:${Date.now()}`;
  const existing = await findByKey(key);
  if (existing) return { ok: true, reused: true, transaction: existing };

  const wallet = await CreditWallet.findOneAndUpdate({ userId }, { $inc: { balance: amount } }, { new: true });
  const txn = await CreditTransaction.create({
    userId, action: "topup", mode: "system", type: "topup", amount, status: "charged",
    idempotencyKey: key, balanceAfter: wallet.balance, metadata
  });
  return { ok: true, transaction: txn, balanceAfter: wallet.balance };
}

export async function recordUsage(entry) {
  return UsageLog.create(entry);
}

export default {
  ensureWallet, getBalance, reserve, confirmReservation, releaseReservation, settleReservation, charge, topup, recordUsage
};
