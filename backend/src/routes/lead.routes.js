import express from "express";
import { callLeadAgain, deleteLead, exportLeadsCsv, getLead, listLeads, updateLead } from "../controllers/lead.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(protect);
router.get("/", listLeads);
router.get("/export/csv", exportLeadsCsv);
router.post("/:id/call-again", callLeadAgain);
router.get("/:id", getLead);
router.put("/:id", updateLead);
router.delete("/:id", deleteLead);

export default router;
