import express from "express";
import Agent from "../models/Agent.js";
import Appointment from "../models/Appointment.js";
import CallLog from "../models/CallLog.js";
import EmailCampaign from "../models/EmailCampaign.js";
import FollowUp from "../models/FollowUp.js";
import Lead from "../models/Lead.js";
import {
  activateAgent,
  activateUser,
  adminAgents,
  adminAppointments,
  adminCalls,
  adminEmailCampaigns,
  adminEmailLogs,
  adminFollowUps,
  adminLeads,
  adminStats,
  auditLogs,
  cancelAppointment,
  cancelFollowUp,
  completeAppointment,
  deleteAgent,
  deleteCall,
  deleteLead,
  deleteUser,
  exportLeads,
  getCall,
  getIntegrationSettings,
  getUser,
  getUserResource,
  getUserUsage,
  impersonateUser,
  listUsers,
  overview,
  pauseAgent,
  resetPassword,
  runFollowUpNow,
  stopImpersonation,
  suspendUser,
  updateAgent,
  updateAppointment,
  updateCredits,
  updateFollowUp,
  updateIntegrationSettings,
  updateLead,
  updateLimits,
  updatePlan,
  updateUser,
  usage
} from "../controllers/admin.controller.js";
import { protect, requireAdmin, requireSuperAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(protect);
router.post("/impersonation/stop", stopImpersonation);
router.use(requireAdmin);

router.get("/overview", overview);
router.get("/stats", adminStats);

router.get("/users", listUsers);
router.get("/users/:id", getUser);
router.patch("/users/:id", updateUser);
router.post("/users/:id/suspend", suspendUser);
router.post("/users/:id/activate", activateUser);
router.post("/users/:id/reset-password", resetPassword);
router.delete("/users/:id", deleteUser);
router.post("/users/:id/impersonate", impersonateUser);

router.get("/users/:id/agents", getUserResource(Agent, []));
router.get("/users/:id/leads", getUserResource(Lead, []));
router.get("/users/:id/calls", getUserResource(CallLog, []));
router.get("/users/:id/appointments", getUserResource(Appointment, []));
router.get("/users/:id/email-campaigns", getUserResource(EmailCampaign, []));
router.get("/users/:id/followups", getUserResource(FollowUp, []));
router.get("/users/:id/usage", getUserUsage);

router.get("/agents", adminAgents);
router.patch("/agents/:id", updateAgent);
router.post("/agents/:id/pause", pauseAgent);
router.post("/agents/:id/activate", activateAgent);
router.delete("/agents/:id", deleteAgent);

router.get("/calls", adminCalls);
router.get("/calls/:id", getCall);
router.delete("/calls/:id", deleteCall);

router.get("/leads", adminLeads);
router.patch("/leads/:id", updateLead);
router.delete("/leads/:id", deleteLead);
router.post("/leads/export", exportLeads);

router.get("/appointments", adminAppointments);
router.patch("/appointments/:id", updateAppointment);
router.post("/appointments/:id/cancel", cancelAppointment);
router.post("/appointments/:id/complete", completeAppointment);

router.get("/followups", adminFollowUps);
router.patch("/followups/:id", updateFollowUp);
router.post("/followups/:id/cancel", cancelFollowUp);
router.post("/followups/:id/run", runFollowUpNow);

router.get("/email-campaigns", adminEmailCampaigns);
router.get("/email-logs", adminEmailLogs);

router.get("/usage", usage);
router.patch("/users/:id/credits", updateCredits);
router.patch("/users/:id/limits", updateLimits);
router.patch("/users/:id/plan", updatePlan);

router.get("/settings/integrations", requireSuperAdmin, getIntegrationSettings);
router.patch("/settings/integrations", requireSuperAdmin, updateIntegrationSettings);

router.get("/audit-logs", auditLogs);

export default router;
