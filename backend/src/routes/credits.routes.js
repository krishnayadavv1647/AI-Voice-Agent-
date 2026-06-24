import express from "express";
import { getCredits, topupCredits } from "../controllers/credits.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getCredits);
router.post("/topup", topupCredits);

export default router;
