// Single source of truth for subscription plans and credit top-up packs.
//
// Model (per the product decision): three PAID plans. Buying a plan is a ONE-TIME purchase that
// grants that plan's credit allotment to the wallet and unlocks its feature set — there is no
// monthly auto-refresh. Users can buy additional credits via top-up packs at any time.
//
// Feature keys must match the cost-table actions in config/creditPricing.js.
const PLANS = {
  starter: {
    key: "starter",
    label: "Starter",
    priceInr: 999,
    priceUsd: 12,
    credits: 1000,
    features: ["voice_call", "email_send"],
    limits: { maxAgents: 3, maxCallsPerMonth: 250, maxEmailsPerMonth: 100, maxLeadSearchesPerMonth: 50 }
  },
  growth: {
    key: "growth",
    label: "Growth",
    priceInr: 2999,
    priceUsd: 35,
    credits: 5000,
    features: ["voice_call", "email_send", "lead_search", "appointment_book"],
    limits: { maxAgents: 10, maxCallsPerMonth: 1000, maxEmailsPerMonth: 500, maxLeadSearchesPerMonth: 200 }
  },
  scale: {
    key: "scale",
    label: "Scale",
    priceInr: 9999,
    priceUsd: 119,
    credits: 20000,
    features: ["voice_call", "email_send", "lead_search", "appointment_book", "image_generate"],
    limits: { maxAgents: 50, maxCallsPerMonth: 5000, maxEmailsPerMonth: 2000, maxLeadSearchesPerMonth: 1000 }
  }
};

const TOPUP_PACKS = {
  tp_500: { key: "tp_500", label: "500 credits", credits: 500, priceInr: 499, priceUsd: 6 },
  tp_2000: { key: "tp_2000", label: "2,000 credits", credits: 2000, priceInr: 1799, priceUsd: 22 },
  tp_5000: { key: "tp_5000", label: "5,000 credits", credits: 5000, priceInr: 3999, priceUsd: 49 }
};

// In-memory cache populated at startup and after admin changes. Stays synchronous so all callers
// (featureAccess, billing, etc.) don't need to be made async.
let _dbPlanOverrides = {};
let _dbTopupOverrides = {};

// Called at app startup and by the admin PATCH /plan-config handler. Dynamic import so this module
// can be loaded before Mongoose models are registered without circular issues.
export async function refreshPlanConfig() {
  try {
    const { default: PlanConfig } = await import("../models/PlanConfig.js");
    const doc = await PlanConfig.findOne({ key: "global" });
    _dbPlanOverrides = doc?.plans?.toObject?.() || doc?.plans || {};
    _dbTopupOverrides = doc?.topupPacks?.toObject?.() || doc?.topupPacks || {};
  } catch (err) {
    console.warn("[plans] refreshPlanConfig failed:", err.message);
  }
}

// Optional env override for prices/credits without a code change (still works; DB override wins):
//   PLAN_PRICING={"growth":{"priceInr":3499,"credits":6000}}
function applyOverrides(table, ...overrideLayers) {
  const out = {};
  for (const [key, value] of Object.entries(table)) {
    let merged = { ...value };
    for (const layer of overrideLayers) {
      if (layer && layer[key]) merged = { ...merged, ...layer[key] };
    }
    out[key] = merged;
  }
  return out;
}

function loadEnvOverrides() {
  const raw = process.env.PLAN_PRICING;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.warn("[plans] PLAN_PRICING is not valid JSON; using defaults.");
    return {};
  }
}

export const PLAN_KEYS = Object.keys(PLANS);

export function listPlans() {
  const envOverrides = loadEnvOverrides();
  return Object.values(applyOverrides(PLANS, envOverrides.plans || envOverrides, _dbPlanOverrides));
}

export function getPlan(key) {
  const envOverrides = loadEnvOverrides();
  const merged = applyOverrides(PLANS, envOverrides.plans || envOverrides, _dbPlanOverrides);
  return merged[key] || null;
}

export function listTopupPacks() {
  const envOverrides = loadEnvOverrides();
  return Object.values(applyOverrides(TOPUP_PACKS, envOverrides.topupPacks || {}, _dbTopupOverrides));
}

export function getTopupPack(key) {
  const envOverrides = loadEnvOverrides();
  const merged = applyOverrides(TOPUP_PACKS, envOverrides.topupPacks || {}, _dbTopupOverrides);
  return merged[key] || null;
}

export function planAllowsFeature(planKey, featureKey) {
  const plan = getPlan(planKey);
  return Boolean(plan && plan.features.includes(featureKey));
}

// Limits map consumed by admin plan changes.
export function planLimits(planKey) {
  return getPlan(planKey)?.limits || {};
}

export default { PLAN_KEYS, listPlans, getPlan, listTopupPacks, getTopupPack, planAllowsFeature, planLimits, refreshPlanConfig };
