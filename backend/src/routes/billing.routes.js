import express from "express";
import { createCheckout, getBillingOverview, verifyCheckout } from "../controllers/billing.controller.js";
import { protect } from "../middleware/auth.middleware.js";

// Note: the provider webhook (POST /api/billing/webhook/:provider) is mounted separately in
// app.js with a raw body parser and is intentionally NOT under this protected router.
const router = express.Router();

router.use(protect);
router.get("/plans", getBillingOverview);
router.post("/checkout", createCheckout);
router.post("/verify", verifyCheckout);

export default router;
