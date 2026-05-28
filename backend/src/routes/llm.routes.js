import express from "express";
import { llmDebug } from "../controllers/llm.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.get("/debug", llmDebug);

export default router;
