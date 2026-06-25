import Plan from "../models/Plan.js";
import PlanChangeLog from "../models/PlanChangeLog.js";
import UserPlan from "../models/UserPlan.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/apiError.js";
import ledger from "../services/billing/creditLedger.service.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function toSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

async function uniqueSlug(base) {
  let slug = base;
  let i = 0;
  while (await Plan.exists({ slug })) {
    i++;
    slug = `${base}-${i}`;
  }
  return slug;
}

function snapshotFromPlan(plan) {
  const limits = plan.limits?.toObject?.() ?? { ...plan.limits };
  return {
    limitsSnapshot: limits,
    monthlyCreditsSnapshot: plan.monthlyCredits,
    rolloverSnapshot: plan.rollover,
  };
}

async function log(planId, action, adminId, extras = {}) {
  return PlanChangeLog.create({ planId, action, adminId, ...extras });
}

// Seed the 3 base plans from static config if any of them are missing.
// Checks by slug so custom plans created before seeding don't block this.
async function maybeSeeds() {
  const { listPlans: staticPlans } = await import("../config/plans.js");
  const base = staticPlans();
  const admin = await User.findOne({ role: "super_admin" }).select("_id");
  const seederId = admin?._id;

  for (let i = 0; i < base.length; i++) {
    const p = base[i];
    const existing = await Plan.findOne({ slug: p.key });
    if (existing) continue;
    await Plan.create({
      name: p.label || p.key,
      slug: p.key,
      tier: p.key,
      isCustom: false,
      visibility: "public",
      status: "active",
      sortOrder: (i + 1) * 10,
      pricing: {
        monthlyPrice: p.priceUsd ?? null,
        yearlyPrice: null,
        currency: "USD",
        isContactSales: false,
      },
      monthlyCredits: p.credits || 0,
      rollover: false,
      limits: {
        maxAgents: p.limits?.maxAgents ?? null,
        maxContacts: null,
        maxCampaigns: null,
        callsPerDay: p.limits?.maxCallsPerMonth ?? null,
        emailsPerDay: p.limits?.maxEmailsPerMonth ?? null,
        teamMembers: null,
        actionsPerMin: 60,
      },
      features: p.features || [],
      byokAllowed: true,
      createdBy: seederId || undefined,
    });
  }
}

// ─── Public ─────────────────────────────────────────────────────────────────

// GET /api/plans
export const listPlansForUser = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  await maybeSeeds().catch((err) => console.warn("[planCatalog] seed error:", err.message));

  const plans = await Plan.find({
    status: "active",
    $or: [
      { visibility: "public" },
      { visibility: "private", assignedUserIds: userId },
    ],
  }).sort({ sortOrder: 1, createdAt: 1 });

  const [userPlan, legacyUser, balance] = await Promise.all([
    UserPlan.findOne({ userId, status: "active" }).populate("planId", "slug"),
    User.findById(userId).select("plan planStatus"),
    ledger.getBalance(userId),
  ]);

  const result = plans.map((plan) => {
    const catalogMatch = userPlan && String(userPlan.planId?._id || userPlan.planId) === String(plan._id);
    const legacyMatch = !userPlan && legacyUser?.plan === plan.slug;
    const isAssignedToYou = plan.visibility === "private" &&
      plan.assignedUserIds.some((id) => String(id) === String(userId));
    return {
      _id: plan._id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      badge: plan.badge,
      tier: plan.tier,
      visibility: plan.visibility,
      pricing: plan.pricing,
      monthlyCredits: plan.monthlyCredits,
      rollover: plan.rollover,
      limits: plan.limits,
      features: plan.features,
      sortOrder: plan.sortOrder,
      byokAllowed: plan.byokAllowed,
      isCurrentPlan: catalogMatch || legacyMatch,
      isAssignedToYou,
    };
  });

  res.json({
    plans: result,
    currentPlan: userPlan?.planId?.slug || legacyUser?.plan || null,
    planStatus: legacyUser?.planStatus || "inactive",
    balance,
  });
});

// ─── Admin CRUD ──────────────────────────────────────────────────────────────

// GET /api/admin/plans
export const adminListPlans = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.visibility) filter.visibility = req.query.visibility;

  const plans = await Plan.find(filter)
    .populate("assignedUserIds", "_id name email")
    .populate("createdBy", "name email")
    .sort({ sortOrder: 1, createdAt: 1 });

  const ids = plans.map((p) => p._id);
  const counts = await UserPlan.aggregate([
    { $match: { planId: { $in: ids }, status: "active" } },
    { $group: { _id: "$planId", count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));

  res.json(plans.map((p) => ({ ...p.toObject(), subscriberCount: countMap[String(p._id)] || 0 })));
});

// GET /api/admin/plans/:id
export const adminGetPlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id)
    .populate("assignedUserIds", "_id name email")
    .populate("createdBy", "name email");
  if (!plan) throw new ApiError(404, "Plan not found");

  const subscriberCount = await UserPlan.countDocuments({ planId: plan._id, status: "active" });
  res.json({ ...plan.toObject(), subscriberCount });
});

// POST /api/admin/plans
export const adminCreatePlan = asyncHandler(async (req, res) => {
  const {
    name, description, badge, tier, isCustom, visibility, assignedUserIds,
    sortOrder, pricing, monthlyCredits, rollover, limits, byokAllowed, features,
  } = req.body;

  if (!name || name.length < 2 || name.length > 60) throw new ApiError(400, "name must be 2–60 characters");
  if (!limits?.actionsPerMin || Number(limits.actionsPerMin) < 1) throw new ApiError(400, "limits.actionsPerMin is required and must be ≥ 1");
  const vis = visibility || "public";
  if (vis === "private" && (!assignedUserIds || assignedUserIds.length === 0)) throw new ApiError(400, "Private plans require at least one assigned user");
  if (vis === "public" && assignedUserIds?.length > 0) throw new ApiError(400, "Public plans cannot have assignedUserIds");
  if (!pricing?.isContactSales && (pricing?.monthlyPrice == null || pricing.monthlyPrice < 0)) throw new ApiError(400, "monthlyPrice is required when isContactSales is false");

  const slug = await uniqueSlug(toSlug(name));

  const plan = await Plan.create({
    name, slug, description, badge,
    tier: tier || "custom",
    isCustom: isCustom !== false,
    visibility: vis,
    assignedUserIds: vis === "private" ? (assignedUserIds || []) : [],
    sortOrder: sortOrder ?? 0,
    pricing: pricing || {},
    monthlyCredits: monthlyCredits ?? 0,
    rollover: rollover || false,
    limits: { ...limits },
    byokAllowed: byokAllowed !== false,
    features: features || [],
    createdBy: req.user._id,
  });

  await log(plan._id, "created", req.user._id);
  res.status(201).json(plan);
});

// PUT /api/admin/plans/:id
export const adminUpdatePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw new ApiError(404, "Plan not found");

  // Optimistic concurrency check
  if (req.body.__v !== undefined && req.body.__v !== plan.__v) {
    throw new ApiError(409, "Plan was modified concurrently. Refetch and try again.");
  }

  const {
    name, description, badge, tier, visibility, assignedUserIds,
    sortOrder, pricing, monthlyCredits, rollover, limits, byokAllowed, features,
    applyImmediately,
  } = req.body;

  if (name !== undefined && (name.length < 2 || name.length > 60)) throw new ApiError(400, "name must be 2–60 characters");
  if (limits?.actionsPerMin !== undefined && Number(limits.actionsPerMin) < 1) throw new ApiError(400, "actionsPerMin must be ≥ 1");

  const newVis = visibility !== undefined ? visibility : plan.visibility;
  const newAssigned = assignedUserIds !== undefined ? assignedUserIds : plan.assignedUserIds.map(String);
  if (newVis === "private" && newAssigned.length === 0) throw new ApiError(400, "Private plans require at least one assigned user");
  if (newVis === "public" && newAssigned.length > 0) throw new ApiError(400, "Public plans cannot have assignedUserIds");

  // Block making the only public plan private
  if (newVis === "private" && plan.visibility === "public") {
    const otherPublic = await Plan.countDocuments({ visibility: "public", status: "active", _id: { $ne: plan._id } });
    if (otherPublic === 0) throw new ApiError(400, "Cannot make this the only plan private — new signups would see no plans.");
  }

  const diff = {};
  const fields = { name, description, badge, tier, visibility, sortOrder, pricing, monthlyCredits, rollover, limits, byokAllowed, features };
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) diff[key] = { before: plan[key], after: val };
  }

  if (name !== undefined) plan.name = name;
  if (description !== undefined) plan.description = description;
  if (badge !== undefined) plan.badge = badge;
  if (tier !== undefined) plan.tier = tier;
  if (visibility !== undefined) {
    plan.visibility = visibility;
    plan.assignedUserIds = newVis === "public" ? [] : (assignedUserIds || plan.assignedUserIds);
  } else if (assignedUserIds !== undefined) {
    plan.assignedUserIds = assignedUserIds;
  }
  if (sortOrder !== undefined) plan.sortOrder = sortOrder;
  if (pricing !== undefined) plan.pricing = { ...(plan.pricing?.toObject?.() ?? plan.pricing), ...pricing };
  if (monthlyCredits !== undefined) plan.monthlyCredits = monthlyCredits;
  if (rollover !== undefined) plan.rollover = rollover;
  if (limits !== undefined) plan.limits = { ...(plan.limits?.toObject?.() ?? plan.limits), ...limits };
  if (byokAllowed !== undefined) plan.byokAllowed = byokAllowed;
  if (features !== undefined) plan.features = features;
  plan.updatedBy = req.user._id;

  await plan.save();
  await log(plan._id, "edited", req.user._id, { diff });

  if (applyImmediately) {
    const snapshot = snapshotFromPlan(plan);
    const affected = await UserPlan.find({ planId: plan._id, status: "active" });
    for (const up of affected) {
      Object.assign(up, snapshot);
      await up.save();
      await log(plan._id, "user_migrated", req.user._id, {
        affectedUserId: up.userId,
        reason: "admin forced immediate plan update",
      });
    }
  }

  res.json(plan);
});

// POST /api/admin/plans/:id/duplicate
export const adminDuplicatePlan = asyncHandler(async (req, res) => {
  const src = await Plan.findById(req.params.id);
  if (!src) throw new ApiError(404, "Plan not found");

  const slug = await uniqueSlug(toSlug(`${src.name} copy`));
  const obj = src.toObject();
  delete obj._id;
  delete obj.__v;
  delete obj.createdAt;
  delete obj.updatedAt;
  delete obj.updatedBy;

  const clone = await Plan.create({
    ...obj,
    name: `${src.name} (Copy)`,
    slug,
    assignedUserIds: [],
    visibility: "public",
    status: "active",
    createdBy: req.user._id,
  });

  await log(clone._id, "created", req.user._id, { reason: `duplicated from ${src._id}` });
  res.status(201).json(clone);
});

// PATCH /api/admin/plans/:id/archive
export const adminArchivePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw new ApiError(404, "Plan not found");
  if (plan.status === "archived") throw new ApiError(400, "Plan is already archived");

  if (plan.tier === "trial") {
    const otherTrialPublic = await Plan.countDocuments({ tier: "trial", visibility: "public", status: "active", _id: { $ne: plan._id } });
    const hasActive = await UserPlan.exists({ planId: plan._id, status: "active" });
    if (hasActive && otherTrialPublic === 0) throw new ApiError(409, "Cannot archive the only active trial plan while users are on it.");
  }

  const subscriberCount = await UserPlan.countDocuments({ planId: plan._id, status: "active" });
  plan.status = "archived";
  plan.updatedBy = req.user._id;
  await plan.save();
  await log(plan._id, "archived", req.user._id);

  res.json({ ok: true, subscriberCount, message: `Plan archived. ${subscriberCount} active subscriber(s) keep their limits until next cycle.` });
});

// PATCH /api/admin/plans/:id/restore
export const adminRestorePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw new ApiError(404, "Plan not found");
  if (plan.status === "active") throw new ApiError(400, "Plan is already active");

  plan.status = "active";
  plan.updatedBy = req.user._id;
  await plan.save();
  await log(plan._id, "restored", req.user._id);

  res.json(plan);
});

// DELETE /api/admin/plans/:id
export const adminDeletePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw new ApiError(404, "Plan not found");

  const everHad = await UserPlan.exists({ planId: plan._id });
  if (everHad) throw new ApiError(409, "This plan has historical subscribers. Archive it instead.");

  await Plan.deleteOne({ _id: plan._id });
  res.json({ ok: true });
});

// POST /api/admin/plans/:id/assign
export const adminAssignUsers = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw new ApiError(404, "Plan not found");
  if (plan.visibility !== "private") throw new ApiError(400, "Only private plans support explicit user assignment.");

  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) throw new ApiError(400, "userIds array required");

  const existing = new Set(plan.assignedUserIds.map(String));
  const toAdd = userIds.filter((id) => !existing.has(String(id)));
  plan.assignedUserIds.push(...toAdd);
  await plan.save();

  for (const uid of toAdd) {
    await log(plan._id, "assigned", req.user._id, { affectedUserId: uid });
  }

  res.json({ ok: true, added: toAdd.length });
});

// POST /api/admin/plans/:id/unassign
export const adminUnassignUsers = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw new ApiError(404, "Plan not found");

  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) throw new ApiError(400, "userIds array required");

  const set = new Set(userIds.map(String));
  plan.assignedUserIds = plan.assignedUserIds.filter((id) => !set.has(String(id)));

  const activeSubscribers = await UserPlan.countDocuments({
    planId: plan._id,
    userId: { $in: userIds },
    status: "active",
  });

  await plan.save();
  for (const uid of userIds) await log(plan._id, "unassigned", req.user._id, { affectedUserId: uid });

  const response = { ok: true, removed: userIds.length };
  if (activeSubscribers > 0) response.warning = `${activeSubscribers} active subscriber(s) no longer have visibility access to this plan`;
  res.json(response);
});

// PUT /api/admin/users/:userId/catalog-plan
export const adminMovePlan = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { planId, reason, force, grantCredits = true } = req.body || {};

  const [plan, user] = await Promise.all([Plan.findById(planId), User.findById(userId)]);
  if (!plan) throw new ApiError(404, "Plan not found");
  if (!user) throw new ApiError(404, "User not found");
  if (plan.status === "archived") throw new ApiError(400, "Cannot assign an archived plan");

  if (!force && plan.visibility === "private" && !plan.assignedUserIds.some((id) => String(id) === String(userId))) {
    throw new ApiError(403, "User is not assigned to this private plan. Pass force:true to override.");
  }

  const snapshot = snapshotFromPlan(plan);
  await UserPlan.findOneAndUpdate(
    { userId },
    { userId, planId: plan._id, status: "active", ...snapshot, cycleStart: new Date() },
    { upsert: true, new: true }
  );

  // Credit the user's wallet with the plan's monthly credits (unless caller opts out)
  if (grantCredits && plan.monthlyCredits > 0) {
    await ledger.topup({
      userId,
      amount: plan.monthlyCredits,
      idempotencyKey: `plan-assign:${String(userId)}:${String(plan._id)}:${Date.now()}`,
      metadata: { planId: String(plan._id), planName: plan.name, action: "admin_plan_assign" },
    });
  }

  await log(plan._id, "user_migrated", req.user._id, { affectedUserId: userId, reason: reason || "admin assigned" });
  res.json({ ok: true, creditsGranted: grantCredits ? plan.monthlyCredits : 0 });
});
