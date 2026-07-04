import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import AgentTemplate from "../src/models/AgentTemplate.js";
import { defaultAgentTemplates } from "../src/data/agentTemplates.seed.js";

async function main() {
  await connectDB();

  const result = await AgentTemplate.bulkWrite(defaultAgentTemplates.map((template) => ({
    updateOne: {
      filter: { slug: template.slug },
      update: { $set: template },
      upsert: true
    }
  })));

  console.log(`Agent templates seeded. Upserted: ${result.upsertedCount}, modified: ${result.modifiedCount}.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Agent template seed failed:", error);
  process.exit(1);
});
