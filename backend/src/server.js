import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { connectDB } from "./config/db.js";
import { startFollowUpWorker } from "./services/followUpWorker.js";
import { startCampaignWorker } from "./services/campaignWorker.js";
import { startScheduledCallWorker } from "./services/scheduledCallWorker.js";
import { startTelegramBot } from "./services/telegram/bot.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`AI Voice Agent API running on port ${PORT}`);
});

connectDB()
  .then(() => {
    console.log("Database connected");
    startScheduledCallWorker();
    startCampaignWorker();
    startFollowUpWorker();
    startTelegramBot();
  })
  .catch((error) => {
    console.error("Database connection failed", error.message);
  });
