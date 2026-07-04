import UserIntegration from "../../models/UserIntegration.js";
import { getActionPricing } from "../../config/creditPricing.js";
import { decryptSecret } from "../../utils/crypto.js";
import ledger from "./creditLedger.service.js";

// Pure decision core — no I/O, fully unit-testable. Encodes the resolver's mode-selection
// rules so the priority order and the fail-closed default are verifiable in isolation.
//
//   1. no credits AND no active key            -> blocked
//   2. active key AND preferOwnKey             -> byok        (own key first, even with credits)
//   3. credits available                       -> platform_credits
//   4. active key (credits exhausted)          -> byok        (automatic BYOK)
//   5. otherwise                               -> blocked
export function decideProviderMode({ balance, cost, platformFee, ownKeyActive, preferOwnKey, fallbackOnFailure }) {
  const hasCredits = Number(balance) >= Number(cost);

  if (!hasCredits && !ownKeyActive) return { mode: "blocked", reason: "NO_CREDITS_NO_KEY" };
  if (ownKeyActive && preferOwnKey) return { mode: "byok", platformFee, fallbackOnFailure: Boolean(fallbackOnFailure) };
  if (hasCredits) return { mode: "platform_credits", cost };
  if (ownKeyActive) return { mode: "byok", platformFee, fallbackOnFailure: Boolean(fallbackOnFailure) };
  return { mode: "blocked", reason: "NO_CREDITS_NO_KEY" };
}

// A connection is eligible for BYOK only if it is fully connected, has a stored key, and has
// not been auto-deactivated (isActive). A disconnected/missing/dead key is treated as "no key"
// so the resolver falls through to credits-or-blocked instead of throwing.
export function isOwnKeyActive(integration) {
  return Boolean(
    integration &&
    integration.status === "connected" &&
    integration.isActive !== false &&
    integration.apiKeyEncrypted
  );
}

const defaultDeps = {
  getBalance: ledger.getBalance,
  getVoiceConnection: (userId) => UserIntegration.findOne({ userId, provider: "vapi", status: "connected" }),
  decrypt: decryptSecret
};

// Resolve the provider for a single call attempt. MUST be called fresh at execution time for
// every attempt (including scheduled/recurring runs) — never cache the result across calls,
// because balance, preference, and key health all change between attempts.
export async function resolveProvider(userId, action = "voice_call", deps = {}) {
  const { getBalance, getVoiceConnection, decrypt } = { ...defaultDeps, ...deps };
  const { cost, platformFee } = getActionPricing(action);

  const [balance, integration] = await Promise.all([getBalance(userId), getVoiceConnection(userId)]);
  const ownKeyActive = isOwnKeyActive(integration);

  const decision = decideProviderMode({
    balance,
    cost,
    platformFee,
    ownKeyActive,
    preferOwnKey: integration?.preferOwnKey,
    fallbackOnFailure: integration?.fallbackOnFailure
  });

  const base = { action, cost, platformFee, integration: ownKeyActive ? integration : null };

  if (decision.mode === "byok") {
    return {
      ...base,
      mode: "byok",
      fallbackOnFailure: decision.fallbackOnFailure,
      apiKey: decrypt(integration.apiKeyEncrypted),
      baseUrl: integration.baseUrl
    };
  }
  if (decision.mode === "platform_credits") {
    return { ...base, mode: "platform_credits" };
  }
  return { ...base, mode: "blocked", reason: decision.reason };
}

export default { resolveProvider, decideProviderMode, isOwnKeyActive };
