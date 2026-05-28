import express from "express";
import { dograhDebug, listDograhWorkflows, readDograhWorkflow } from "../controllers/dograh.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.get("/debug", dograhDebug);
router.get("/workflows", listDograhWorkflows);
router.get("/workflows/:workflowId", readDograhWorkflow);

export default router;
