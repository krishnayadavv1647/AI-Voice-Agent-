// One-off migration: clean up legacy TelephonyConfig documents whose `inboundMode`
// holds the stale value "agent_runtime" (never a valid enum value in the current
// schema). Any .save() on such a document now fails Mongoose enum validation, e.g.
//   "TelephonyConfig validation failed: inboundMode: `agent_runtime` is not a valid
//    enum value for path `inboundMode`."
// This rewrites the offending value to the schema default "dograh_ai".
//
// Uses updateMany so the write bypasses the enum validator that would otherwise
// reject the stale document.
//
// Run with:  node scripts/migrateInboundMode.js          (dry run)
//            node scripts/migrateInboundMode.js --apply   (write changes)
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import TelephonyConfig from "../src/models/TelephonyConfig.js";

const STALE_VALUE = "agent_runtime";
const TARGET_VALUE = "dograh_ai";

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();

  const affected = await TelephonyConfig.find({ inboundMode: STALE_VALUE })
    .select("_id name phoneNumber userId inboundMode");
  console.log(`Found ${affected.length} TelephonyConfig docs with inboundMode="${STALE_VALUE}".`);

  for (const config of affected) {
    console.log(`${config._id} (${config.name || config.phoneNumber || "unnamed"}): ${STALE_VALUE} -> ${TARGET_VALUE}`);
  }

  if (apply) {
    const result = await TelephonyConfig.updateMany(
      { inboundMode: STALE_VALUE },
      { $set: { inboundMode: TARGET_VALUE } }
    );
    console.log(`Applied ${result.modifiedCount} updates.`);
  } else {
    console.log(`Dry run: ${affected.length} docs would change. Re-run with --apply.`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
