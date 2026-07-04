import express from "express";
import { getAgentTemplate, listAgentTemplates } from "../controllers/agentTemplate.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.get("/", listAgentTemplates);
router.get("/:slug", getAgentTemplate);

export default router;
