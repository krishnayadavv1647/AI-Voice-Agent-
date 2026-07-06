import "dotenv/config";

import mongoose from "mongoose";

import app from "./app.js";
import { connectDB } from "./config/db.js";
import { startFollowUpWorker } from "./services/followUpWorker.js";
import { startCampaignWorker } from "./services/campaignWorker.js";
import { startScheduledCallWorker } from "./services/scheduledCallWorker.js";
import { startEmailSyncWorker } from "./workers/emailSyncWorker.js";
import { startTelegramBot } from "./services/telegram/bot.js";
import { startPipelineScheduler } from "./services/pipelineScheduler.js";
import { refreshPlanConfig } from "./config/plans.js";
import { refreshCreditPricing } from "./config/creditPricing.js";
import { warmGeminiConnection } from "./llm/gemini.llm.js";

const PORT = process.env.PORT || 5000;

connectDB()
  .then(async () => {
    console.log("Database connected");
    await Promise.all([refreshPlanConfig(), refreshCreditPricing()]);
    const server = app.listen(PORT, () => {
      console.log(`AI Voice Agent API running on port ${PORT}`);
      warmGeminiConnection();
      if (process.env.ENABLE_GEMINI_KEEPWARM !== "false") {
        setInterval(() => {
          warmGeminiConnection();
        }, 4 * 60 * 1000).unref();
      }
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Backend port ${PORT} is already in use. Another backend server is probably already running.`);
        process.exit(1);
      }

      console.error("Backend server failed to start", error.message);
      process.exit(1);
    });

    // Render sends SIGTERM on every deploy. Stop accepting NEW connections but let in-flight SSE
    // voice streams finish before exiting, so a deploy never severs a live call mid-sentence.
    const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS || 30000);
    let shuttingDown = false;
    function gracefulShutdown(signal) {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[shutdown] ${signal} received; draining connections for up to ${SHUTDOWN_GRACE_MS}ms`);
      server.close(() => {
        console.log("[shutdown] all connections drained");
        mongoose.connection.close(false).finally(() => process.exit(0));
      });
      setTimeout(() => {
        console.warn("[shutdown] grace period expired; forcing exit");
        process.exit(0);
      }, SHUTDOWN_GRACE_MS).unref();
    }
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // Background workers steal CPU from real-time voice. Run them only when explicitly enabled, so
    // the same codebase can run as a web service (workers off) and a separate Render Background
    // Worker service (RUN_WORKERS=true). Default (unset) = OFF.
    if (process.env.RUN_WORKERS === "true") {
      startScheduledCallWorker();
      startCampaignWorker();
      startFollowUpWorker();
      startEmailSyncWorker();
      startTelegramBot();
      startPipelineScheduler();
      console.log("[server] background workers started (RUN_WORKERS=true)");
    } else {
      console.log("[server] background workers disabled on this instance (set RUN_WORKERS=true to enable)");
    }
  })
  .catch((error) => {
    console.error("Database connection failed", error.message);
    process.exit(1);
  });
