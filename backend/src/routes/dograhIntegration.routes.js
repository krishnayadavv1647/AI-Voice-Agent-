import express from "express";
import {
  connectDograhIntegration,
  disconnectDograhIntegration,
  getDograhIntegration,
  testDograhIntegration,
  updateDograhIntegration
} from "../controllers/dograhIntegration.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getDograhIntegration);
router.post("/connect", connectDograhIntegration);
router.post("/test", testDograhIntegration);
router.patch("/", updateDograhIntegration);
router.delete("/disconnect", disconnectDograhIntegration);

export default router;
