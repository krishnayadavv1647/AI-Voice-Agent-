// One-off migration: map legacy plan values (free/starter/pro/agency) onto the new three-tier
// model (starter/growth/scale). Legacy free users become inactive (must purchase); paid legacy
// tiers map to the closest new tier and stay active.
//
// Run with:  node scripts/migratePlans.js          (dry run)
//            node scripts/migratePlans.js --apply   (write changes)
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import User from "../src/models/User.js";

const MAP = {
  free: { plan: "starter", planStatus: "inactive" },
  starter: { plan: "starter", planStatus: "active" },
  pro: { plan: "growth", planStatus: "active" },
  agency: { plan: "scale", planStatus: "active" }
};

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();

  const users = await User.find({ plan: { $in: Object.keys(MAP) } }).select("_id email plan planStatus");
  console.log(`Found ${users.length} users on legacy plans.`);

  let changed = 0;
  for (const user of users) {
    const target = MAP[user.plan];
    if (!target) continue;
    const next = { plan: target.plan, planStatus: target.planStatus };
    console.log(`${user.email}: ${user.plan}/${user.planStatus} -> ${next.plan}/${next.planStatus}`);
    if (apply) {
      await User.updateOne({ _id: user._id }, { $set: next });
    }
    changed += 1;
  }

  console.log(apply ? `Applied ${changed} updates.` : `Dry run: ${changed} users would change. Re-run with --apply.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
