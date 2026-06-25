import express from "express";
import Agent from "../models/Agent.js";
import Appointment from "../models/Appointment.js";
import CallLog from "../models/CallLog.js";
import Campaign from "../models/Campaign.js";
import EmailCampaign from "../models/EmailCampaign.js";
import FollowUp from "../models/FollowUp.js";
import Lead from "../models/Lead.js";
import {
  activateAgent,
  activateUser,
  adminAgents,
  adminAppointments,
  adminCalls,
  adminCampaigns,
  adminEmailCampaigns,
  adminEmailLogs,
  adminFollowUps,
  adminLeads,
  adminStats,
  auditLogs,
  cancelCampaign,
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
  getPlanConfig,
  getUser,
  getUserResource,
  getUserUsage,
  impersonateUser,
  listUsers,
  overview,
  pauseAgent,
  pauseCampaign,
  resetPassword,
  runFollowUpNow,
  stopImpersonation,
  suspendUser,
  updateAgent,
  updateAppointment,
  updateCampaign,
  addWalletCredits,
  updateCredits,
  updateFollowUp,
  updateIntegrationSettings,
  updateLead,
  updateLimits,
  updatePlan,
  updatePlanConfig,
  updateUser,
  usage
} from "../controllers/admin.controller.js";
import {
  adminListPlans,
  adminGetPlan,
  adminCreatePlan,
  adminUpdatePlan,
  adminDuplicatePlan,
  adminArchivePlan,
  adminRestorePlan,
  adminDeletePlan,
  adminAssignUsers,
  adminUnassignUsers,
  adminMovePlan,
} from "../controllers/planCatalog.controller.js";
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
router.get("/users/:id/campaigns", getUserResource(Campaign, []));
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
router.get("/campaigns", adminCampaigns);
router.patch("/campaigns/:id", updateCampaign);
router.post("/campaigns/:id/pause", pauseCampaign);
router.post("/campaigns/:id/cancel", cancelCampaign);
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
router.post("/users/:id/wallet-credits", requireSuperAdmin, addWalletCredits);
router.patch("/users/:id/credits", updateCredits);
router.patch("/users/:id/limits", updateLimits);
router.patch("/users/:id/plan", updatePlan);

router.get("/settings/integrations", requireSuperAdmin, getIntegrationSettings);
router.patch("/settings/integrations", requireSuperAdmin, updateIntegrationSettings);

router.get("/plan-config", requireSuperAdmin, getPlanConfig);
router.patch("/plan-config", requireSuperAdmin, updatePlanConfig);

// Plan catalog (super admin only)
router.get("/catalog-plans", requireSuperAdmin, adminListPlans);
router.get("/catalog-plans/:id", requireSuperAdmin, adminGetPlan);
router.post("/catalog-plans", requireSuperAdmin, adminCreatePlan);
router.put("/catalog-plans/:id", requireSuperAdmin, adminUpdatePlan);
router.post("/catalog-plans/:id/duplicate", requireSuperAdmin, adminDuplicatePlan);
router.patch("/catalog-plans/:id/archive", requireSuperAdmin, adminArchivePlan);
router.patch("/catalog-plans/:id/restore", requireSuperAdmin, adminRestorePlan);
router.delete("/catalog-plans/:id", requireSuperAdmin, adminDeletePlan);
router.post("/catalog-plans/:id/assign", requireSuperAdmin, adminAssignUsers);
router.post("/catalog-plans/:id/unassign", requireSuperAdmin, adminUnassignUsers);
router.put("/users/:userId/catalog-plan", requireSuperAdmin, adminMovePlan);

router.get("/audit-logs", auditLogs);

export default router;
