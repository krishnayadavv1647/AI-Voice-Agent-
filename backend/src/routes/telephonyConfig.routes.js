import express from "express";
import {
  createTelephonyConfig,
  deleteTelephonyConfig,
  configureTelephonyWebhook,
  listTelephonyConfigs,
  testTelephonyConfig,
  updateTelephonyConfig
} from "../controllers/telephonyConfig.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.route("/").get(listTelephonyConfigs).post(createTelephonyConfig);
router.route("/:id").put(updateTelephonyConfig).delete(deleteTelephonyConfig);
router.post("/:id/test", testTelephonyConfig);
router.post("/:id/configure-webhook", configureTelephonyWebhook);

export default router;
