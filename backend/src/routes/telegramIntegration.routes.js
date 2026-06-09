import express from "express";
import {
  createTelegramConnectCode,
  disconnectTelegram,
  getTelegramStatus,
  updateTelegramSettings
} from "../controllers/telegramIntegration.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(protect);

router.post("/connect-code", createTelegramConnectCode);
router.get("/status", getTelegramStatus);
router.patch("/settings", updateTelegramSettings);
router.delete("/disconnect", disconnectTelegram);

export default router;
