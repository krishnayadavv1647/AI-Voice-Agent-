import express from "express";
import {
  connectDograhIntegration,
  disconnectDograhIntegration,
  getDograhIntegration,
  testDograhIntegration,
  updateDograhFallback,
  updateDograhIntegration
} from "../controllers/dograhIntegration.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getDograhIntegration);
router.post("/connect", connectDograhIntegration);
router.post("/test", testDograhIntegration);
router.post("/:integrationId/test", testDograhIntegration);
router.patch("/", updateDograhIntegration);
router.put("/:integrationId", updateDograhIntegration);
router.put("/:integrationId/fallback", updateDograhFallback);
router.delete("/disconnect", disconnectDograhIntegration);
router.delete("/:integrationId", disconnectDograhIntegration);

export default router;
