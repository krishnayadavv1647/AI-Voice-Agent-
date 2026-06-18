import express from "express";
import rateLimit from "express-rate-limit";
import {
  connectBrevo,
  connectImap,
  disconnectBrevo,
  disconnectGmail,
  disconnectImap,
  getEmailIntegrationStatus,
  getGmailAuthUrl,
  gmailCallback,
  listBrevoSenders,
  syncNow,
  testBrevo,
  testImap,
  updateBrevoSender
} from "../controllers/emailIntegrationController.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

const connectionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
const syncLimiter = rateLimit({ windowMs: 60 * 1000, max: 3, standardHeaders: true, legacyHeaders: false });

router.get("/gmail/callback", gmailCallback);

router.use(protect);
router.get("/status", getEmailIntegrationStatus);
router.post("/brevo/connect", connectionLimiter, connectBrevo);
router.post("/brevo/test", connectionLimiter, testBrevo);
router.get("/brevo/senders", listBrevoSenders);
router.patch("/brevo/sender", updateBrevoSender);
router.delete("/brevo", disconnectBrevo);
router.post("/imap/connect", connectionLimiter, connectImap);
router.post("/imap/test", connectionLimiter, testImap);
router.delete("/imap", disconnectImap);
router.post("/sync-now", syncLimiter, syncNow);
router.get("/gmail/auth-url", getGmailAuthUrl);
router.delete("/gmail", disconnectGmail);

export default router;
