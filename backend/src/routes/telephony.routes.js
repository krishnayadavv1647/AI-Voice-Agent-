import express from "express";
import {
  handleIncomingTelephony,
  handleTwilioIncomingFallback
} from "../controllers/telephonyConfig.controller.js";

const router = express.Router();

router.get("/twilio/incoming", handleTwilioIncomingFallback);
router.post("/twilio/incoming", handleTwilioIncomingFallback);
router.get("/:provider/incoming", handleIncomingTelephony);
router.post("/:provider/incoming", handleIncomingTelephony);

export default router;
