import { syncDueEmailIntegrations } from "../services/emailInboundSyncService.js";

let syncInterval = null;

export function startEmailSyncWorker() {
  if (syncInterval) return;
  const intervalSeconds = Math.max(30, Number(process.env.EMAIL_SYNC_INTERVAL_SECONDS || 60));
  const run = async () => {
    try {
      const result = await syncDueEmailIntegrations();
      if (result.processedCount) {
        console.info("[email-sync] completed", { processedCount: result.processedCount });
      }
    } catch (error) {
      console.error("[email-sync] worker failed", { message: error.message });
    }
  };
  run();
  syncInterval = setInterval(run, intervalSeconds * 1000);
}
