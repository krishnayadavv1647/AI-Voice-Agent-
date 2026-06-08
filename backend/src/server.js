import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { connectDB } from "./config/db.js";
import { startScheduledCallWorker } from "./services/scheduledCallWorker.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`AI Voice Agent API running on port ${PORT}`);
});

connectDB()
  .then(() => {
    console.log("Database connected");
    startScheduledCallWorker();
  })
  .catch((error) => {
    console.error("Database connection failed", error.message);
  });
