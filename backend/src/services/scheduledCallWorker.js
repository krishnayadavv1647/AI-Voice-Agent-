import Agent from "../models/Agent.js";
import ScheduledCall from "../models/ScheduledCall.js";
import { triggerOutboundCallForAgent } from "./outboundCall.service.js";

const POLL_INTERVAL_MS = 30 * 1000;
const MAX_DUE_PER_TICK = 10;

let intervalId = null;
let running = false;

async function processSchedule(schedule) {
  const claimed = await ScheduledCall.findOneAndUpdate(
    { _id: schedule._id, status: "pending" },
    { $set: { status: "processing", lastError: "" }, $inc: { attempts: 1 } },
    { new: true }
  );

  if (!claimed) return;

  console.log("[Scheduled Calls] schedule claimed", {
    scheduleId: claimed._id.toString(),
    agentId: claimed.agentId.toString(),
    phoneNumber: claimed.phoneNumber
  });

  try {
    const agent = await Agent.findOne({ _id: claimed.agentId, userId: claimed.userId });
    if (!agent) throw new Error("Linked agent was not found.");

    const { callLog } = await triggerOutboundCallForAgent({
      agent,
      userId: claimed.userId,
      phoneNumber: claimed.phoneNumber
    });

    claimed.status = "completed";
    claimed.callLogId = callLog._id;
    claimed.processedAt = new Date();
    await claimed.save();

    console.log("[Scheduled Calls] schedule completed", {
      scheduleId: claimed._id.toString(),
      callLogId: callLog._id.toString()
    });
  } catch (error) {
    claimed.status = "failed";
    claimed.lastError = error.message;
    claimed.processedAt = new Date();
    await claimed.save();

    console.error("[Scheduled Calls] schedule failed", {
      scheduleId: claimed._id.toString(),
      error: error.message
    });
  }
}

async function tick() {
  if (running) return;
  running = true;

  try {
    const dueSchedules = await ScheduledCall.find({
      status: "pending",
      scheduledForUtc: { $lte: new Date() }
    })
      .sort({ scheduledForUtc: 1 })
      .limit(MAX_DUE_PER_TICK);

    for (const schedule of dueSchedules) {
      console.log("[Scheduled Calls] due schedule found", {
        scheduleId: schedule._id.toString(),
        scheduledForUtc: schedule.scheduledForUtc
      });
      await processSchedule(schedule);
    }
  } catch (error) {
    console.error("[Scheduled Calls] worker tick failed", error.message);
  } finally {
    running = false;
  }
}

export function startScheduledCallWorker() {
  if (intervalId || process.env.NODE_ENV === "test") return;

  console.log("[Scheduled Calls] worker started");
  intervalId = setInterval(tick, POLL_INTERVAL_MS);
  tick();
}
