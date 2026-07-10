// One-off backfill: set `apiKeyMode` on existing agents that predate the field.
//  - Agent has a connected LLM integration (AgentLLMConfiguration with provider !== "platform_default"
//    and a non-null integrationId)            -> "byok"
//  - Otherwise                                -> "default_system"
//
// Idempotent: only touches agents whose apiKeyMode is missing/null. Safe to re-run.
//
// Run with:  node scripts/backfillApiKeyMode.js            (dry run — prints counts only)
//            node scripts/backfillApiKeyMode.js --apply     (write changes)
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Agent from "../src/models/Agent.js";
import AgentLLMConfiguration from "../src/models/AgentLLMConfiguration.js";

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();

  const agents = await Agent.find({
    $or: [{ apiKeyMode: { $exists: false } }, { apiKeyMode: null }, { apiKeyMode: "" }]
  }).select("_id userId apiKeyMode");

  console.log(`Found ${agents.length} agents without apiKeyMode.`);

  let byok = 0;
  let defaultSystem = 0;

  for (const agent of agents) {
    const config = await AgentLLMConfiguration.findOne({
      agentId: agent._id,
      userId: agent.userId
    }).select("provider integrationId");

    const hasByokIntegration = Boolean(
      config && config.provider !== "platform_default" && config.integrationId
    );
    const mode = hasByokIntegration ? "byok" : "default_system";

    if (mode === "byok") byok += 1;
    else defaultSystem += 1;

    if (apply) {
      await Agent.updateOne({ _id: agent._id }, { $set: { apiKeyMode: mode } });
    }
  }

  console.log(`  byok:           ${byok}`);
  console.log(`  default_system: ${defaultSystem}`);
  console.log(
    apply
      ? `Applied apiKeyMode to ${agents.length} agents.`
      : `Dry run: ${agents.length} agents would change. Re-run with --apply.`
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
