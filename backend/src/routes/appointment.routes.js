import express from "express";
import {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  deleteAppointment,
  getAppointment,
  listAppointments,
  rescheduleAppointment,
  updateAppointment
} from "../controllers/appointment.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.get("/", listAppointments);
router.post("/", createAppointment);
router.get("/:id", getAppointment);
router.patch("/:id", updateAppointment);
router.delete("/:id", deleteAppointment);
router.post("/:id/reschedule", rescheduleAppointment);
router.post("/:id/cancel", cancelAppointment);
router.post("/:id/complete", completeAppointment);

export default router;
