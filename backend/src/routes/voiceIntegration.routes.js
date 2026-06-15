import express from "express";
import rateLimit from "express-rate-limit";
import {
  connectVoiceIntegration,
  disconnectVoiceIntegration,
  getAgentVoiceConfig,
  listProviderModels,
  listProviderVoices,
  listVoiceIntegrations,
  previewProviderVoice,
  testVoiceIntegration,
  updateAgentVoiceConfig
} from "../controllers/voiceIntegration.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();
const validationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const previewLimiter = rateLimit({ windowMs: 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false });

router.use(protect);
router.get("/integrations/voice", listVoiceIntegrations);
router.post("/integrations/voice/:provider/connect", validationLimiter, connectVoiceIntegration);
router.post("/integrations/voice/:provider/test", validationLimiter, testVoiceIntegration);
router.delete("/integrations/voice/:provider", disconnectVoiceIntegration);
router.get("/integrations/voice/:provider/voices", listProviderVoices);
router.get("/integrations/voice/:provider/models", listProviderModels);
router.post("/integrations/voice/:provider/preview", previewLimiter, previewProviderVoice);
router.get("/agents/:agentId/voice-config", getAgentVoiceConfig);
router.put("/agents/:agentId/voice-config", updateAgentVoiceConfig);

export default router;
