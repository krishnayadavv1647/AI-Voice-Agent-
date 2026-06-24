// Credit cost table. For each billable action:
//   - platform: credits charged when the call runs on platform credits (platform global key)
//   - byok:     credits charged as a platform fee when the call runs on the user's own key
//
// Values are intentionally conservative placeholders. Override per-deployment with the
// CREDIT_PRICING env var (JSON) or via the admin Plan Config panel (DB wins over env).
const DEFAULT_PRICING = {
  // voice_call is metered PER MINUTE of call duration (platform credits / minute, BYOK fee / minute).
  voice_call: { platform: 10, byok: 1 },
  dograh_call: { platform: 10, byok: 1 },
  // The remaining meters are charged once per action.
  email_send: { platform: 1, byok: 0 },
  lead_search: { platform: 25, byok: 5 },
  appointment_book: { platform: 5, byok: 0 },
  image_generate: { platform: 15, byok: 0 }
};

// In-memory DB override — populated at startup and after admin saves.
let _dbPricingOverrides = {};

export async function refreshCreditPricing() {
  try {
    const { default: PlanConfig } = await import("../models/PlanConfig.js");
    const doc = await PlanConfig.findOne({ key: "global" });
    _dbPricingOverrides = doc?.creditPricing?.toObject?.() || doc?.creditPricing || {};
  } catch (err) {
    console.warn("[creditPricing] refreshCreditPricing failed:", err.message);
  }
}

function loadEnvOverrides() {
  const raw = process.env.CREDIT_PRICING;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.warn("[creditPricing] CREDIT_PRICING is not valid JSON; using defaults.");
    return {};
  }
}

export function getActionPricing(action = "dograh_call") {
  const envOverrides = loadEnvOverrides();
  const base = DEFAULT_PRICING[action] || DEFAULT_PRICING.dograh_call;
  const dbOverride = _dbPricingOverrides[action] || {};
  // DB wins over env, env wins over defaults
  const merged = { ...base, ...(envOverrides[action] || {}), ...dbOverride };
  return {
    cost: Math.max(0, Number(merged.platform) || 0),
    platformFee: Math.max(0, Number(merged.byok) || 0)
  };
}

export function listPricing() {
  const envOverrides = loadEnvOverrides();
  const actions = new Set([
    ...Object.keys(DEFAULT_PRICING),
    ...Object.keys(envOverrides),
    ...Object.keys(_dbPricingOverrides)
  ]);
  const out = {};
  for (const action of actions) out[action] = getActionPricing(action);
  return out;
}

// Returns the raw DB+env merged table (for admin display — shows platform + byok fields).
export function listPricingRaw() {
  const envOverrides = loadEnvOverrides();
  const actions = new Set([
    ...Object.keys(DEFAULT_PRICING),
    ...Object.keys(envOverrides),
    ...Object.keys(_dbPricingOverrides)
  ]);
  const out = {};
  for (const action of actions) {
    const base = DEFAULT_PRICING[action] || { platform: 0, byok: 0 };
    out[action] = {
      ...base,
      ...(envOverrides[action] || {}),
      ...(_dbPricingOverrides[action] || {})
    };
  }
  return out;
}

export default { getActionPricing, listPricing, listPricingRaw, refreshCreditPricing };
