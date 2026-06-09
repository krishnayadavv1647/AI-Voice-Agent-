import express from "express";
import {
  enrichLeadFinderEmails,
  getRun,
  importLeadFinderLeads,
  listProviders,
  listRuns,
  saveRunLeads,
  searchLeadFinder
} from "../controllers/leadFinder.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.get("/providers", listProviders);
router.post("/search", searchLeadFinder);
router.post("/enrich-emails", enrichLeadFinderEmails);
router.get("/runs", listRuns);
router.get("/runs/:id", getRun);
router.post("/runs/:id/save", saveRunLeads);
router.post("/leads/import", importLeadFinderLeads);

export default router;
