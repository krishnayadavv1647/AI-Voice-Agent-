import express from "express";
import rateLimit from "express-rate-limit";
import {
  connectLLMIntegration,
  disconnectLLMIntegration,
  getAgentLLMConfig,
  listLLMIntegrations,
  listLLMModels,
  testLLMCompletion,
  testLLMIntegration,
  updateAgentLLMConfig,
  updateLLMIntegration
} from "../controllers/llmIntegration.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();
const validationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const modelLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const completionLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

router.use(protect);
router.get("/integrations/llm", listLLMIntegrations);
router.post("/integrations/llm/:provider/connect", validationLimiter, connectLLMIntegration);
router.post("/integrations/llm/:integrationId/test", validationLimiter, testLLMIntegration);
router.put("/integrations/llm/:integrationId", validationLimiter, updateLLMIntegration);
router.delete("/integrations/llm/:integrationId", disconnectLLMIntegration);
router.get("/integrations/llm/:integrationId/models", modelLimiter, listLLMModels);
router.post("/integrations/llm/:integrationId/test-completion", completionLimiter, testLLMCompletion);
router.get("/agents/:agentId/llm-config", getAgentLLMConfig);
router.put("/agents/:agentId/llm-config", updateAgentLLMConfig);

export default router;
