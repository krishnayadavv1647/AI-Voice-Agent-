import express from "express";
import { adminAgents, adminCalls, adminLeads, adminStats, adminUsers } from "../controllers/admin.controller.js";
import { adminOnly, protect } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(protect, adminOnly);
router.get("/stats", adminStats);
router.get("/users", adminUsers);
router.get("/agents", adminAgents);
router.get("/calls", adminCalls);
router.get("/leads", adminLeads);

export default router;
