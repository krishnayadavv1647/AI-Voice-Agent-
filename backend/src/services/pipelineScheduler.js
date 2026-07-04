import cron from "node-cron";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import { extractLeadForCallLog } from "./leadGeneration.service.js";

const MAX_FAILURES = 5;
// Calls stuck in syncing/extracting longer than this are considered stale-locked and retried
const STALE_LOCK_MS = 5 * 60 * 1000;

let isRunning = false;

export async function runPipelinePass(options = {}) {
  // Global guard: if a full pass is already running, skip (prevents overlap on slow runs).
  // Scoped (on-demand) passes are allowed to run alongside the cron pass.
  if (isRunning && !options.scopedCallIds) return;
  if (!options.scopedCallIds) isRunning = true;

  try {
    const now = new Date();
    const staleCutoff = new Date(now - STALE_LOCK_MS);
    const scopeFilter = options.scopedCallIds?.length ? { _id: { $in: options.scopedCallIds } } : {};

    // Reset stale locks: calls stuck in extracting > STALE_LOCK_MS (e.g. after a crash)
    await CallLog.updateMany(
      { pipelineStatus: { $in: ["syncing", "extracting"] }, updatedAt: { $lt: staleCutoff } },
      { $set: { pipelineStatus: "pending" } }
    );

    // Transcripts arrive via the Vapi webhook (push-based), so no provider polling is needed here.
    // --- Extract leads from calls that have a transcript but no lead ---
    const extractCandidates = await CallLog.find({
      ...scopeFilter,
      leadCaptured: { $ne: true },
      $or: [{ transcript: { $nin: [null, ""] } }, { transcriptUrl: { $nin: [null, ""] } }],
      autoExtractFailureCount: { $lt: MAX_FAILURES },
      // "completed" = pipeline done (even if no lead was extractable), so don't retry it.
      pipelineStatus: { $nin: ["syncing", "extracting", "completed"] }
    }).limit(50);

    for (const callLog of extractCandidates) {
      // Never create a duplicate lead — if one already exists for this call, mark done.
      const existingLead = await Lead.exists({ callLogId: callLog._id });
      if (existingLead) {
        await CallLog.findByIdAndUpdate(callLog._id, {
          $set: { pipelineStatus: "completed", autoExtractedAt: now, leadCaptured: true }
        });
        continue;
      }

      try {
        await CallLog.findByIdAndUpdate(callLog._id, { $set: { pipelineStatus: "extracting" } });

        // Re-fetch for the freshest transcript, then run the SAME logic as the Extract Lead button.
        const freshCallLog = await CallLog.findById(callLog._id);
        if (!freshCallLog) continue;

        await extractLeadForCallLog(freshCallLog, { failOnGeminiError: false });

        // Mark completed whether or not a lead was found (no useful data = stop retrying).
        await CallLog.findByIdAndUpdate(freshCallLog._id, {
          $set: { pipelineStatus: "completed", autoExtractedAt: now, autoExtractFailureCount: 0, lastPipelineError: null }
        });
      } catch (error) {
        console.error("[Pipeline] Auto-extract failed", { callLogId: callLog._id.toString(), error: error.message });
        await CallLog.findByIdAndUpdate(callLog._id, {
          $set: { pipelineStatus: "failed", lastPipelineError: error.message },
          $inc: { autoExtractFailureCount: 1 }
        });
      }
    }
  } catch (error) {
    console.error("[Pipeline] Pipeline pass error:", error.message);
  } finally {
    if (!options.scopedCallIds) isRunning = false;
  }
}

export function startPipelineScheduler() {
  console.log("[Pipeline] Starting auto-pipeline scheduler (every 60s)");
  cron.schedule("*/1 * * * *", () => {
    runPipelinePass().catch((err) => {
      console.error("[Pipeline] Unhandled error in pipeline pass:", err.message);
    });
  });
}
