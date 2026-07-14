import express from "express";
import rateLimit from "express-rate-limit";
import {
  backfillThreads,
  createCampaign,
  generateEmail,
  generateThreadReply,
  getCampaignStatus,
  getFolderCounts,
  getMessageAttachment,
  getThread,
  getThreadMessages,
  getUnreadEmailCount,
  inboundBrevo,
  listCampaigns,
  listLogs,
  listProviders,
  listThreads,
  markThreadRead,
  pollInboundNow,
  searchGmail,
  sendCampaign,
  sendEmail,
  sendTestEmail,
  sendThreadReply,
  simulateInboundReply,
  testInboundMatch
} from "../controllers/email.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// Throttle outbound send endpoints (compose, test, reply) to curb abuse.
const sendLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post("/inbound/brevo", inboundBrevo);

router.use(protect);
router.get("/campaigns", listCampaigns);
router.post("/campaigns", createCampaign);
router.get("/logs", listLogs);
router.get("/providers", listProviders);
router.get("/unread-count", getUnreadEmailCount);
router.get("/folder-counts", getFolderCounts);
router.get("/threads", listThreads);
router.get("/gmail/search", searchGmail);
router.post("/backfill-threads", backfillThreads);
router.post("/inbound/poll-now", pollInboundNow);
router.post("/inbound/test-match", testInboundMatch);
router.get("/messages/:messageId/attachments/:attachmentId", getMessageAttachment);
router.get("/threads/:id/messages", getThreadMessages);
router.get("/threads/:id", getThread);
router.post("/threads/:id/read", markThreadRead);
router.post("/threads/:id/simulate-inbound", simulateInboundReply);
router.post("/threads/:id/generate-reply", generateThreadReply);
router.post("/threads/:id/reply", sendLimiter, sendThreadReply);
router.post("/generate", generateEmail);
router.post("/send", sendLimiter, sendEmail);
router.post("/test", sendLimiter, sendTestEmail);
router.post("/campaigns/:id/send", sendCampaign);
router.get("/campaigns/:id/status", getCampaignStatus);

export default router;
