import express from "express";
import {
  backfillThreads,
  createCampaign,
  generateEmail,
  generateThreadReply,
  getThread,
  getThreadMessages,
  inboundBrevo,
  listCampaigns,
  listLogs,
  listProviders,
  listThreads,
  sendCampaign,
  sendTestEmail,
  sendThreadReply,
  simulateInboundReply
} from "../controllers/email.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/inbound/brevo", inboundBrevo);

router.use(protect);
router.get("/campaigns", listCampaigns);
router.post("/campaigns", createCampaign);
router.get("/logs", listLogs);
router.get("/providers", listProviders);
router.get("/threads", listThreads);
router.post("/backfill-threads", backfillThreads);
router.get("/threads/:id/messages", getThreadMessages);
router.get("/threads/:id", getThread);
router.post("/threads/:id/simulate-inbound", simulateInboundReply);
router.post("/threads/:id/generate-reply", generateThreadReply);
router.post("/threads/:id/reply", sendThreadReply);
router.post("/generate", generateEmail);
router.post("/test", sendTestEmail);
router.post("/campaigns/:id/send", sendCampaign);

export default router;
