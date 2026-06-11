import Campaign from "../models/Campaign.js";
import CampaignRecipient from "../models/CampaignRecipient.js";
import { runnableCampaignCapacity, triggerCampaignRecipient } from "./campaign.service.js";

const DEFAULT_INTERVAL_SECONDS = 10;

let intervalId = null;
let running = false;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function tick() {
  if (running) return;
  running = true;

  try {
    const now = new Date();
    const campaigns = await Campaign.find({ status: { $in: ["scheduled", "running"] } }).select("_id callingSpeed");

    for (const campaign of campaigns) {
      const capacity = await runnableCampaignCapacity(campaign._id);
      if (!capacity) continue;
      const batchSize = Math.max(1, Number(campaign.callingSpeed?.batchSize) || 5);
      const limit = Math.min(capacity, batchSize);
      const recipients = await CampaignRecipient.find({
        campaignId: campaign._id,
        status: "scheduled",
        scheduledAt: { $lte: now }
      })
        .sort({ scheduledAt: 1 })
        .limit(limit);

      console.log("[Campaign Worker] due recipients found", {
        campaignId: campaign._id.toString(),
        count: recipients.length,
        capacity,
        batchSize
      });

      await Promise.all(recipients.map((recipient) => triggerCampaignRecipient(recipient)));
    }
  } catch (error) {
    console.error("[Campaign Worker] tick failed", error.message);
  } finally {
    running = false;
  }
}

export function startCampaignWorker() {
  if (intervalId || process.env.NODE_ENV === "test" || process.env.CAMPAIGN_WORKER_ENABLED === "false") return;
  const intervalSeconds = positiveInteger(process.env.CAMPAIGN_WORKER_INTERVAL_SECONDS, DEFAULT_INTERVAL_SECONDS);
  console.log("[Campaign Worker] started", { intervalSeconds });
  intervalId = setInterval(tick, intervalSeconds * 1000);
  tick();
}
