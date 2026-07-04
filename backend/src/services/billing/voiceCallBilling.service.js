import crypto from "crypto";
import { getActionPricing } from "../../config/creditPricing.js";
import ledger from "./creditLedger.service.js";

const ACTION = "voice_call";
const FINAL_BILLABLE = new Set(["completed", "answered", "cancelled"]);

export function creditEnforcementEnabled() {
  return process.env.CREDIT_ENFORCEMENT === "true";
}

function estimatedMinutes() {
  return Math.max(1, Math.floor(Number(process.env.CALL_ESTIMATED_MINUTES) || 5));
}

// Pure: how much to reserve up front. Blocks if the wallet can't cover one minute; otherwise
// reserves the estimate, capped at what the balance can afford.
export function computeReservation({ balance, perMinute, estimateMinutes }) {
  if (perMinute <= 0) return { blocked: false, reserveMinutes: estimateMinutes, amount: 0 };
  if (balance < perMinute) return { blocked: true, reserveMinutes: 0, amount: 0 };
  const affordable = Math.floor(balance / perMinute);
  const reserveMinutes = Math.max(1, Math.min(estimateMinutes, affordable));
  return { blocked: false, reserveMinutes, amount: reserveMinutes * perMinute };
}

// Pure: actual cost from final duration + outcome. Rounds up to whole minutes; only connected
// calls with real talk time are billable.
export function computeVoiceCharge({ durationSeconds, normalizedStatus, perMinute, platformFee }) {
  const seconds = Number(durationSeconds) || 0;
  const minutes = seconds > 0 ? Math.ceil(seconds / 60) : 0;
  const billable = FINAL_BILLABLE.has(normalizedStatus) && minutes > 0;
  return {
    minutes,
    billable,
    platformCost: billable ? minutes * perMinute : 0,
    byokFee: billable ? minutes * platformFee : 0
  };
}

// Voice calls run on the platform's Vapi account, so they always spend platform credits. (There is
// no BYOK voice provider after the move to Vapi; the "byok" mode is retained for other meters.)
function billingModeForAgent() {
  return "platform_credits";
}

// Called just before a call is placed. For platform_credits it reserves an estimated cost and
// blocks the call if the wallet can't cover even one minute. For BYOK it never blocks (the tiny
// per-minute fee is charged at settle). No-op unless enforcement is enabled.
export async function reserveVoiceCallBilling({ userId, agent }) {
  if (!creditEnforcementEnabled()) return { enforced: false, blocked: false, billingMode: null, billingCallId: null };

  const billingCallId = crypto.randomUUID();
  const billingMode = billingModeForAgent(agent);
  const { cost: perMinute } = getActionPricing(ACTION);

  if (billingMode === "byok") {
    return { enforced: true, blocked: false, billingMode, billingCallId };
  }

  const balance = await ledger.getBalance(userId);
  const plan = computeReservation({ balance, perMinute, estimateMinutes: estimatedMinutes() });
  if (plan.blocked) {
    return {
      enforced: true,
      blocked: true,
      billingMode,
      billingCallId,
      message: "You don't have enough platform credits to start this call. Add credits to continue."
    };
  }

  const amount = plan.amount;
  const reservation = await ledger.reserve({
    userId, amount, action: ACTION, idempotencyKey: `${billingCallId}:voice:reserve`,
    metadata: { reserveMinutes: plan.reserveMinutes, perMinute }
  });
  if (!reservation.ok) {
    return { enforced: true, blocked: true, billingMode, billingCallId, message: "Could not reserve platform credits for this call." };
  }

  return { enforced: true, blocked: false, billingMode, billingCallId, reservationKey: `${billingCallId}:voice:reserve`, reservedAmount: amount };
}

// Releases a reservation when the call failed to even start (e.g. the trigger threw).
export async function releaseVoiceReservation(billingCallId) {
  if (!billingCallId) return;
  await ledger.releaseReservation({ idempotencyKey: `${billingCallId}:voice:reserve` });
}

// Called when a call reaches a terminal state with a known duration. Settles the reservation
// against actual minutes (platform) or charges the actual BYOK fee, records usage, and marks the
// CallLog settled. Idempotent and safe to call from multiple finalization paths.
export async function settleVoiceCallBilling(callLog) {
  if (!callLog || !callLog.billingEnforced || callLog.billingSettled || !callLog.billingCallId) return null;
  if (!FINAL_BILLABLE.has(callLog.normalizedStatus) && !TERMINAL_NONBILLABLE(callLog.normalizedStatus)) return null;

  const { cost: perMinute, platformFee } = getActionPricing(ACTION);
  const { minutes, billable, platformCost, byokFee } = computeVoiceCharge({
    durationSeconds: callLog.durationSeconds,
    normalizedStatus: callLog.normalizedStatus,
    perMinute,
    platformFee
  });

  let creditsCharged = 0;

  if (callLog.billingMode === "platform_credits") {
    const key = `${callLog.billingCallId}:voice:reserve`;
    if (!billable) {
      await ledger.releaseReservation({ idempotencyKey: key });
    } else {
      const settled = await ledger.settleReservation({ idempotencyKey: key, actualAmount: platformCost });
      creditsCharged = settled.charged ?? platformCost;
    }
  } else if (callLog.billingMode === "byok") {
    if (billable && byokFee > 0) {
      const charged = await ledger.charge({
        userId: callLog.userId, amount: byokFee, action: ACTION, mode: "byok",
        idempotencyKey: `${callLog.billingCallId}:byok:fee`, allowNegative: true,
        metadata: { minutes }
      });
      creditsCharged = charged.amount || 0;
    }
  }

  await ledger.recordUsage({
    userId: callLog.userId,
    action: ACTION,
    mode: callLog.billingMode,
    success: FINAL_BILLABLE.has(callLog.normalizedStatus),
    cost: minutes * perMinute,
    platformFee,
    creditsCharged,
    callId: String(callLog._id),
    metadata: { minutes, durationSeconds: Number(callLog.durationSeconds) || 0, outcome: callLog.normalizedStatus }
  });

  callLog.billingSettled = true;
  callLog.creditsCharged = creditsCharged;
  await callLog.save();
  return { creditsCharged, minutes, mode: callLog.billingMode };
}

// Terminal but non-billable outcomes (call never connected) still need their reservation released.
function TERMINAL_NONBILLABLE(status) {
  return ["declined", "no_answer", "busy", "failed"].includes(status);
}

export default { creditEnforcementEnabled, reserveVoiceCallBilling, releaseVoiceReservation, settleVoiceCallBilling };
