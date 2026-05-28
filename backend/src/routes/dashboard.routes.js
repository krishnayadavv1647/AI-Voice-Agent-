import express from "express";
import { getDashboard } from "../controllers/dashboard.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protect, async (req, res, next) => {
  try {
    res.json(await getDashboard(req.user));
  } catch (error) {
    next(error);
  }
});

export default router;
