import cron from "node-cron";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import { isTerminalCallStatus, TERMINAL_CALL_STATUSES } from "./callOutcome.service.js";
import { syncDograhCallStatus } from "./dograhCallStatusSync.service.js";
import { extractLeadForCallLog } from "./leadGeneration.service.js";

const MAX_FAILURES = 5;
// Calls stuck in syncing/extracting longer than this are considered stale-locked and retried
const STALE_LOCK_MS = 5 * 60 * 1000;

let isRunning = false;

export async function runPipelinePass(options = {}) {
  // Global guard: if a full pass is already running, skip (prevents overlap on slow runs)
  if (isRunning && !options.scopedCallIds) return;
  if (!options.scopedCallIds) isRunning = true;

  try {
    const now = new Date();
    const staleCutoff = new Date(now - STALE_LOCK_MS);

    // --- Step 1: Find non-final calls to sync ---
    const syncQuery = {
      normalizedStatus: { $nin: Array.from(TERMINAL_CALL_STATUSES) },
      autoSyncFailureCount: { $lt: MAX_FAILURES }
    };

    if (options.scopedCallIds?.length) {
      syncQuery._id = { $in: options.scopedCallIds };
    }

    // Reset stale locks: calls stuck in syncing/extracting > STALE_LOCK_MS
    await CallLog.updateMany(
      {
        pipelineStatus: { $in: ["syncing", "extracting"] },
        updatedAt: { $lt: staleCutoff }
      },
      { $set: { pipelineStatus: "pending" } }
    );

    const syncCandidates = await CallLog.find({
      ...syncQuery,
      pipelineStatus: { $nin: ["syncing", "extracting"] }
    }).limit(50);

    for (const callLog of syncCandidates) {
      // Skip if not yet old enough (< 30s) to avoid competing with scheduleDograhStatusSync
      if (now - callLog.createdAt < 30 * 1000) continue;

      // Skip if Dograh IDs are missing — sync can't do anything without them
      if (!callLog.dograhWorkflowId || !callLog.dograhRunId) continue;

      try {
        await CallLog.findByIdAndUpdate(callLog._id, { $set: { pipelineStatus: "syncing" } });

        const updated = await syncDograhCallStatus(callLog._id);

        if (!updated) {
          await CallLog.findByIdAndUpdate(callLog._id, {
            $set: { pipelineStatus: "failed", lastPipelineError: "Sync returned null" },
            $inc: { autoSyncFailureCount: 1 }
          });
          continue;
        }

        const hasFinalStatus = isTerminalCallStatus(updated.normalizedStatus);

        if (hasFinalStatus) {
          // Sync completed (with or without transcript yet)
          await CallLog.findByIdAndUpdate(updated._id, {
            $set: { pipelineStatus: "synced", autoSyncedAt: now, autoSyncFailureCount: 0, lastPipelineError: null }
          });
        } else {
          // Still in non-final status — reset to pending for next tick
          await CallLog.findByIdAndUpdate(updated._id, {
            $set: { pipelineStatus: "pending", autoSyncedAt: now, lastPipelineError: null }
          });
        }
      } catch (error) {
        console.error("[Pipeline] Auto-sync failed", { callLogId: callLog._id.toString(), error: error.message });
        await CallLog.findByIdAndUpdate(callLog._id, {
          $set: { pipelineStatus: "failed", lastPipelineError: error.message },
          $inc: { autoSyncFailureCount: 1 }
        });
      }
    }

    // --- Step 2: Find final-status calls with transcript but no lead yet ---
    const extractQuery = {
      normalizedStatus: { $in: Array.from(TERMINAL_CALL_STATUSES) },
      leadCaptured: { $ne: true },
      $or: [{ transcript: { $nin: [null, ""] } }, { transcriptUrl: { $nin: [null, ""] } }],
      autoExtractFailureCount: { $lt: MAX_FAILURES },
      // Skip calls already in progress or completed (completed = pipeline done, even if no lead found)
      pipelineStatus: { $nin: ["extracting", "completed"] }
    };

    if (options.scopedCallIds?.length) {
      extractQuery._id = { $in: options.scopedCallIds };
    }

    const extractCandidates = await CallLog.find(extractQuery).limit(50);

    for (const callLog of extractCandidates) {
      // Skip if a lead already exists in the Lead collection (prevents duplicates)
      const existingLead = await Lead.exists({ callLogId: callLog._id });
      if (existingLead) {
        await CallLog.findByIdAndUpdate(callLog._id, {
          $set: { pipelineStatus: "completed", autoExtractedAt: now, leadCaptured: true }
        });
        continue;
      }

      try {
        await CallLog.findByIdAndUpdate(callLog._id, { $set: { pipelineStatus: "extracting" } });

        // Re-fetch to get the most current transcript before extraction
        const freshCallLog = await CallLog.findById(callLog._id);
        if (!freshCallLog) continue;

        await extractLeadForCallLog(freshCallLog, { failOnGeminiError: false });

        // Mark completed whether or not a lead was found (no useful data = stop retrying)
        await CallLog.findByIdAndUpdate(freshCallLog._id, {
          $set: {
            pipelineStatus: "completed",
            autoExtractedAt: now,
            autoExtractFailureCount: 0,
            lastPipelineError: null
          }
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
