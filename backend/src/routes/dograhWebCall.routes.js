import express from "express";
import {
  endDograhWebCallController as endDograhWebCall,
  listDograhWebCallHistoryController,
  startDograhWebCallController as startDograhWebCall
} from "../controllers/dograhWebCall.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.post("/start", startDograhWebCall);
router.post("/end", endDograhWebCall);
router.get("/history/:agentId", listDograhWebCallHistoryController);

export default router;
