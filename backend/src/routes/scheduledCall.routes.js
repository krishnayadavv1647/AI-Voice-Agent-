import express from "express";
import {
  cancelScheduledCall,
  createScheduledCall,
  listScheduledCalls,
  listScheduledCallsForAgent
} from "../controllers/scheduledCall.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.post("/", createScheduledCall);
router.get("/", listScheduledCalls);
router.get("/agent/:agentId", listScheduledCallsForAgent);
router.patch("/:id/cancel", cancelScheduledCall);

export default router;
