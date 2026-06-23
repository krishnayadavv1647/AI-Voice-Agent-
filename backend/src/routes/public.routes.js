import express from "express";
import {
  chatWithPublicAgent,
  createPublicAppointment,
  getPublicAgent,
  getPublicAgentBioPage,
  getPublicWebCallToken,
  requestCallbackCall
} from "../controllers/public.controller.js";

const router = express.Router();

router.get("/agents/:publicSlug", getPublicAgent);
router.get("/agents/:idOrSlug/bio-page", getPublicAgentBioPage);
router.get("/age/:publicSlug", getPublicAgent);
router.post("/agents/:publicSlug/chat", chatWithPublicAgent);
router.post("/agents/:publicSlug/web-call-token", getPublicWebCallToken);
router.post("/agents/:agentId/appointments", createPublicAppointment);
router.post("/agents/:agentId/request-call", requestCallbackCall);

export default router;
