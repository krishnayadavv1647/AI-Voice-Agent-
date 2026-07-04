import express from "express";
import { getVoiceConnection, updateVoicePreferences } from "../controllers/connections.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.get("/voice", getVoiceConnection);
router.patch("/voice/preferences", updateVoicePreferences);

export default router;
