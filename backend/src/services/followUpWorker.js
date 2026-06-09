import FollowUp from "../models/FollowUp.js";
import { runFollowUp } from "./followUp.service.js";

const POLL_INTERVAL_MS = 60 * 1000;
const MAX_DUE_PER_TICK = 10;

let intervalId = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;

  try {
    const dueFollowUps = await FollowUp.find({
      status: "scheduled",
      scheduledAt: { $lte: new Date() },
      $expr: { $lt: ["$attemptCount", "$maxAttempts"] }
    })
      .sort({ scheduledAt: 1 })
      .limit(MAX_DUE_PER_TICK);

    for (const followUp of dueFollowUps) {
      try {
        await runFollowUp(followUp);
      } catch (error) {
        console.error("[Follow-ups] follow-up failed", {
          followUpId: followUp._id.toString(),
          error: error.message
        });
      }
    }
  } catch (error) {
    console.error("[Follow-ups] worker tick failed", error.message);
  } finally {
    running = false;
  }
}

export function startFollowUpWorker() {
  if (intervalId || process.env.NODE_ENV === "test") return;

  console.log("[Follow-ups] worker started");
  intervalId = setInterval(tick, POLL_INTERVAL_MS);
  tick();
}
