import express from "express";
import { getDograhConnection, updateDograhPreferences } from "../controllers/connections.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.get("/dograh", getDograhConnection);
router.patch("/dograh/preferences", updateDograhPreferences);

export default router;
