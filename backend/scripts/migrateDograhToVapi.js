// One-off migration for the final provider decommission.
//
// Run with:
//   node scripts/migrateDograhToVapi.js              (dry-run carry phase)
//   node scripts/migrateDograhToVapi.js --apply      (apply carry phase)
//   node scripts/migrateDograhToVapi.js --prune --apply
//
// Phase A converts legacy agents to Vapi and creates assistants when needed.
// Phase B prunes legacy fields and deletes removed provider connections.
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Agent from "../src/models/Agent.js";
import CallLog from "../src/models/CallLog.js";
import CampaignRecipient from "../src/models/CampaignRecipient.js";
import CreditTransaction from "../src/models/CreditTransaction.js";
import PlanConfig from "../src/models/PlanConfig.js";
import Notification from "../src/models/Notification.js";
import UsageLog from "../src/models/UsageLog.js";
import TelephonyConfig from "../src/models/TelephonyConfig.js";
import UserIntegration from "../src/models/UserIntegration.js";
import WebhookEvent from "../src/models/WebhookEvent.js";
import { VapiProvider } from "../src/providers/vapi.provider.js";

const LEGACY_PROVIDER = "dograh";

const agentUnset = {
  dograhWorkflowId: "",
  dograhWorkflowUuid: "",
  dograhConnectionType: "",
  dograhIntegrationId: "",
  dograhDraftVersionId: "",
  dograhPublishedVersionId: "",
  dograhAgentId: "",
  dograhWorkflowName: "",
  dograhConnection: "",
  dograhStatus: "",
  workflowSyncStatus: "",
  workflowSyncError: "",
  dograhSyncStatus: "",
  dograhError: "",
  dograhRawResponse: "",
  dograhNeedsUpdate: "",
  dograhLastSyncedAt: "",
  dograhEmbedToken: "",
  dograhWidgetEnabled: ""
};

const callLogUnset = {
  dograhAgentId: "",
  dograhWorkflowId: "",
  dograhWorkflowUuid: "",
  dograhRunId: "",
  rawDograhPayload: ""
};

const genericDograhUnset = {
  dograhWorkflowId: "",
  dograhWorkflowUuid: "",
  dograhRunId: "",
  dograhSyncStatus: "",
  dograhSyncError: "",
  dograhLastSyncedAt: "",
  dograhEffectiveProvider: "",
  dograhEffectiveModel: "",
  dograhEffectiveSttProvider: "",
  dograhEffectiveSttModel: "",
  dograhEffectiveTtsProvider: "",
  dograhEffectiveTtsModel: "",
  dograhEffectiveTtsVoiceId: "",
  dograhProviderSync: "",
  dograhRawResponse: "",
  dograhTelephonyConfigId: "",
  dograhPhoneNumberId: "",
  dograhIntegrationId: "",
  dograhInboundWebhookUrl: ""
};

function shouldCreateAssistant(agent) {
  return !agent.providerAgentId && agent.status !== "archived";
}

async function carryToVapi({ apply }) {
  const legacyAgentIds = await Agent.collection.find({
    $or: [
      { provider: LEGACY_PROVIDER },
      { provider: { $exists: false }, dograhWorkflowId: { $exists: true, $ne: null } },
      { provider: null, dograhWorkflowId: { $exists: true, $ne: null } }
    ]
  }).project({ _id: 1 }).toArray();
  const agents = await Agent.find({ _id: { $in: legacyAgentIds.map((agent) => agent._id) } });

  const summary = {
    total: agents.length,
    converted: 0,
    assistantsCreated: 0,
    skippedAssistant: 0,
    dryRun: !apply
  };

  for (const agent of agents) {
    agent.provider = "vapi";
    if (agent.voiceProvider === "Dograh Default") agent.voiceProvider = "elevenlabs";
    if (agent.llmProvider === "dograh_default") agent.llmProvider = "google_gemini";
    if (agent.sttProvider === "dograh_default") agent.sttProvider = "deepgram";
    if (agent.ttsProvider === "dograh_default") agent.ttsProvider = "elevenlabs";

    if (shouldCreateAssistant(agent)) {
      if (apply) {
        const result = await VapiProvider.create(agent);
        agent.providerAgentId = result.providerAgentId;
        agent.providerWorkflowId = result.providerWorkflowId;
      }
      summary.assistantsCreated += 1;
    } else {
      summary.skippedAssistant += 1;
    }

    if (apply) await agent.save();
    summary.converted += 1;
  }

  console.log("Carry phase summary:", summary);
}

async function pruneFields({ apply }) {
  const operations = [
    ["agents", () => Agent.updateMany({}, { $unset: agentUnset })],
    ["calllogs", () => CallLog.updateMany({}, { $unset: callLogUnset })],
    ["campaignrecipients", () => CampaignRecipient.updateMany({}, { $unset: genericDograhUnset })],
    ["credittransactions", () => CreditTransaction.updateMany({}, { $unset: genericDograhUnset })],
    ["planconfigs", () => PlanConfig.updateMany({}, { $unset: genericDograhUnset })],
    ["notifications", () => Notification.updateMany({}, { $unset: genericDograhUnset })],
    ["usagelogs", () => UsageLog.updateMany({}, { $unset: genericDograhUnset })],
    ["telephonyconfigs", () => TelephonyConfig.updateMany({}, {
      $unset: genericDograhUnset,
      $set: { inboundMode: "agent_runtime" }
    })],
    ["webhookevents", () => WebhookEvent.updateMany({ provider: LEGACY_PROVIDER }, { $set: { provider: "vapi" } })],
    ["userintegrations", () => UserIntegration.deleteMany({ provider: LEGACY_PROVIDER })]
  ];

  if (!apply) {
    console.log(`Dry run: would run ${operations.length} prune operations.`);
    return;
  }

  for (const [name, operation] of operations) {
    const result = await operation();
    console.log(`${name}:`, {
      matched: result.matchedCount ?? result.deletedCount ?? 0,
      modified: result.modifiedCount ?? result.deletedCount ?? 0
    });
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const prune = process.argv.includes("--prune");
  await connectDB();

  if (prune) await pruneFields({ apply });
  else await carryToVapi({ apply });

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Migration failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
