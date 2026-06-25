// One-off migration: seed the Plan catalog from the static plan config and optionally
// backfill UserPlan records for existing users.
//
// Run with:  node scripts/migratePlansToCatalog.js          (dry run — only shows what would happen)
//            node scripts/migratePlansToCatalog.js --apply   (write changes)
//
// Step 1: Create Plan catalog documents for the 3 base plans (starter/growth/scale).
// Step 2: For every User with an active plan, create a UserPlan pointing to the matching catalog plan
//         and snapshot the user's current limits/credits.
// Step 3: Print a summary.
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import User from "../src/models/User.js";
import Plan from "../src/models/Plan.js";
import UserPlan from "../src/models/UserPlan.js";

const BASE_PLANS = [
  {
    name: "Starter", slug: "starter", tier: "starter", sortOrder: 10,
    pricing: { monthlyPrice: 12, yearlyPrice: null, currency: "USD", isContactSales: false },
    monthlyCredits: 1000,
    limits: { maxAgents: 3, callsPerDay: 250, emailsPerDay: 100, actionsPerMin: 60 },
    features: ["voice_call", "email_send"],
  },
  {
    name: "Growth", slug: "growth", tier: "growth", sortOrder: 20,
    pricing: { monthlyPrice: 35, yearlyPrice: null, currency: "USD", isContactSales: false },
    monthlyCredits: 5000,
    limits: { maxAgents: 10, callsPerDay: 1000, emailsPerDay: 500, actionsPerMin: 120 },
    features: ["voice_call", "email_send", "lead_search", "appointment_book"],
  },
  {
    name: "Scale", slug: "scale", tier: "scale", sortOrder: 30,
    pricing: { monthlyPrice: 119, yearlyPrice: null, currency: "USD", isContactSales: false },
    monthlyCredits: 20000,
    limits: { maxAgents: 50, callsPerDay: 5000, emailsPerDay: 2000, actionsPerMin: 300 },
    features: ["voice_call", "email_send", "lead_search", "appointment_book", "image_generate"],
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();

  const admin = await User.findOne({ role: "super_admin" }).select("_id email");
  if (!admin) {
    console.warn("No super_admin found — seeded plans will have no createdBy.");
  } else {
    console.log(`Using super_admin: ${admin.email}`);
  }

  // Step 1: seed base plans
  let plansCreated = 0;
  let plansSkipped = 0;
  const planMap = {};

  for (const p of BASE_PLANS) {
    const existing = await Plan.findOne({ slug: p.slug });
    if (existing) {
      console.log(`[skip] Plan "${p.slug}" already exists`);
      planMap[p.slug] = existing;
      plansSkipped++;
      continue;
    }
    console.log(`[create] Plan "${p.slug}"`);
    if (apply) {
      const created = await Plan.create({
        ...p,
        isCustom: false,
        visibility: "public",
        status: "active",
        rollover: false,
        byokAllowed: true,
        createdBy: admin?._id,
      });
      planMap[p.slug] = created;
    }
    plansCreated++;
  }

  // Step 2: backfill UserPlan for users with active plans
  const activeUsers = await User.find({
    plan: { $in: ["starter", "growth", "scale"] },
    planStatus: "active",
  }).select("_id email plan planStatus limits credits");

  console.log(`\nFound ${activeUsers.length} active users to backfill.`);

  let migrated = 0;
  let failed = 0;
  const failedUsers = [];

  for (const user of activeUsers) {
    const catalogPlan = planMap[user.plan] || await Plan.findOne({ slug: user.plan });
    if (!catalogPlan) {
      console.warn(`  [fail] No catalog plan found for slug "${user.plan}" (user: ${user.email})`);
      failedUsers.push({ email: user.email, reason: `no catalog plan for slug: ${user.plan}` });
      failed++;
      continue;
    }

    const existingUserPlan = await UserPlan.findOne({ userId: user._id });
    if (existingUserPlan) {
      console.log(`  [skip] UserPlan already exists for ${user.email}`);
      continue;
    }

    console.log(`  [migrate] ${user.email} -> ${user.plan}`);
    if (apply) {
      await UserPlan.create({
        userId: user._id,
        planId: catalogPlan._id,
        status: "active",
        // Snapshot the user's current limits
        limitsSnapshot: {
          maxAgents: user.limits?.maxAgents ?? null,
          maxContacts: null,
          maxCampaigns: null,
          callsPerDay: user.limits?.maxCallsPerMonth ?? null,
          emailsPerDay: user.limits?.maxEmailsPerMonth ?? null,
          teamMembers: null,
          actionsPerMin: catalogPlan.limits?.actionsPerMin ?? 60,
        },
        monthlyCreditsSnapshot: catalogPlan.monthlyCredits,
        rolloverSnapshot: false,
        cycleStart: user.planStartedAt || user.createdAt,
      });
    }
    migrated++;
  }

  console.log("\n─── Summary ───────────────────────────────────");
  console.log(`Plans created:  ${plansCreated}${apply ? "" : " (dry run)"}`);
  console.log(`Plans skipped:  ${plansSkipped}`);
  console.log(`Users migrated: ${migrated}${apply ? "" : " (dry run)"}`);
  console.log(`Users failed:   ${failed}`);
  if (failedUsers.length) {
    console.log("Failed users:");
    failedUsers.forEach((u) => console.log(`  - ${u.email}: ${u.reason}`));
  }
  if (!apply) console.log("\nDry run complete. Re-run with --apply to write changes.");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
