import express from "express";
import {
  cancelFollowUp,
  createFollowUp,
  deleteFollowUp,
  getFollowUp,
  listFollowUps,
  rescheduleFollowUp,
  runFollowUpNow,
  updateFollowUp
} from "../controllers/followUp.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.get("/", listFollowUps);
router.post("/", createFollowUp);
router.get("/:id", getFollowUp);
router.patch("/:id", updateFollowUp);
router.delete("/:id", deleteFollowUp);
router.post("/:id/run", runFollowUpNow);
router.post("/:id/reschedule", rescheduleFollowUp);
router.post("/:id/cancel", cancelFollowUp);

export default router;
