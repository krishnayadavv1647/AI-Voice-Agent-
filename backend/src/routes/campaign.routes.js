import express from "express";
import {
  addLeadsToCampaign,
  campaignLeadOptions,
  campaignStats,
  cancelCampaign,
  createCampaign,
  deleteCampaign,
  getCampaign,
  importRecipients,
  listCampaigns,
  listRecipients,
  pauseCampaign,
  resumeCampaign,
  retryFailed,
  startCampaign,
  updateCampaign
} from "../controllers/campaign.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(protect);

router.get("/", listCampaigns);
router.post("/", createCampaign);
router.get("/lead-options", campaignLeadOptions);
router.get("/:id", getCampaign);
router.patch("/:id", updateCampaign);
router.delete("/:id", deleteCampaign);
router.post("/:id/add-leads", addLeadsToCampaign);
router.post("/:id/import-recipients", express.raw({ type: "*/*", limit: "10mb" }), importRecipients);
router.post("/:id/start", startCampaign);
router.post("/:id/pause", pauseCampaign);
router.post("/:id/resume", resumeCampaign);
router.post("/:id/cancel", cancelCampaign);
router.get("/:id/recipients", listRecipients);
router.get("/:id/stats", campaignStats);
router.post("/:id/retry-failed", retryFailed);

export default router;
