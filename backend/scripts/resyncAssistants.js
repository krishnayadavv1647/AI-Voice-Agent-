// Re-sync existing Vapi assistants so they pick up changes to buildAssistantConfig — notably the
// human warm-transfer `transferCall` tool, which is only added to agents that have a valid E.164
// contactNumber. New/edited agents get it automatically; agents that haven't been touched since the
// feature shipped need this one-time resync.
//
// Idempotent: it just re-PATCHes each assistant with its current config, so re-running is a no-op
// beyond redundant API calls. Only agents with a providerAgentId (an existing Vapi assistant) are
// touched.
//
// Run with:  node scripts/resyncAssistants.js              (dry run — counts only, no API writes)
//            node scripts/resyncAssistants.js --dry-run     (same as above, explicit)
//            node scripts/resyncAssistants.js --apply       (PATCH each assistant on Vapi)
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Agent from "../src/models/Agent.js";
import { buildAssistantConfig, updateAssistant } from "../src/services/vapi.service.js";

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();

  const agents = await Agent.find({ providerAgentId: { $ne: null, $exists: true } });
  console.log(`Found ${agents.length} agents with a Vapi assistant (providerAgentId).`);

  let updated = 0;
  let failed = 0;
  let withTransfer = 0;
  const failures = [];

  for (const agent of agents) {
    // Reflect whether this agent will get the transfer tool, for visibility (tools live under
    // model.tools in the custom-llm config).
    const hasTransfer = Array.isArray(buildAssistantConfig(agent).model?.tools);
    if (hasTransfer) withTransfer += 1;

    if (!apply) continue;

    try {
      await updateAssistant(agent.providerAgentId, agent);
      updated += 1;
    } catch (error) {
      failed += 1;
      failures.push({ agentId: agent._id.toString(), message: error?.message || String(error) });
    }
  }

  console.log(`  agents that will/do have the transfer tool: ${withTransfer}`);
  console.log(`  agents without a valid contactNumber:       ${agents.length - withTransfer}`);

  if (apply) {
    console.log(`Applied: ${updated} assistants updated, ${failed} failed.`);
    for (const f of failures) console.error(`  FAILED ${f.agentId}: ${f.message}`);
  } else {
    console.log(`Dry run: ${agents.length} assistants would be re-synced. Re-run with --apply.`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Resync failed:", error);
  process.exit(1);
});
