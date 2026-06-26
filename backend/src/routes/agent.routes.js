import express from "express";
import {
  connectDograhWorkflow,
  createDograhWorkflowForAgent,
  getDograhBindingForAgent,
  getDograhMigrationStatus,
  createDograhAgentEmbedToken,
  deleteDograhAgentEmbedToken,
  createAgent,
  getBioPage,
  getDograhAgentEmbedToken,
  getAgent,
  listBioPageTemplates,
  listAgentCalls,
  listAgents,
  backfillAgentImages,
  generateAgentImageForAgent,
  pauseAgent,
  previewRegeneratedPrompt,
  publishAgent,
  publishBioPage,
  removeAgent,
  resetBioPage,
  syncDograhRuntimeForAgent,
  syncProviderForAgent,
  migrateDograhAgent,
  testChatAgent,
  testAgent,
  triggerOutboundCall,
  triggerTestCall,
  updateAgent,
  updateDograhBindingForAgent,
  updateBioPage,
  updateDograhWorkflowForAgent,
  updateShareSettings,
  unpublishBioPage,
  uploadBioPageCover,
  uploadBioPageAgentImage,
  uploadBioPageLogo,
  uploadBioPageTopicIcon,
  uploadAgentAvatar,
  deleteAgentAvatar
} from "../controllers/agent.controller.js";
import { adminOnly, protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.route("/").post(createAgent).get(listAgents);
router.post("/backfill-images", adminOnly, backfillAgentImages);
router.get("/bio-page/templates", listBioPageTemplates);
router.route("/:id").get(getAgent).put(updateAgent).delete(removeAgent);
router.post("/:id/generate-image", generateAgentImageForAgent);
router.get("/:id/bio-page", getBioPage);
router.patch("/:id/bio-page", updateBioPage);
router.put("/:id/bio-page", updateBioPage);
router.post("/:id/bio-page/reset", resetBioPage);
router.post("/:id/bio-page/publish", publishBioPage);
router.post("/:id/bio-page/unpublish", unpublishBioPage);
router.post("/:id/avatar", express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "2mb" }), uploadAgentAvatar);
router.delete("/:id/avatar", deleteAgentAvatar);
router.post("/:id/bio-page/logo", express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "2mb" }), uploadBioPageLogo);
router.post("/:id/bio-page/cover", express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "5mb" }), uploadBioPageCover);
router.post("/:id/bio-page/agent-image", express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "5mb" }), uploadBioPageAgentImage);
router.post("/:id/bio-page/topic-icon", express.raw({ type: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"], limit: "1mb" }), uploadBioPageTopicIcon);
router.patch("/:agentId/share-settings", updateShareSettings);
router.post("/:id/regenerate-prompt-preview", previewRegeneratedPrompt);
router.post("/:id/test", testAgent);
router.post("/:id/test-chat", testChatAgent);
router.post("/:id/publish", publishAgent);
router.post("/:id/pause", pauseAgent);
router.post("/:id/connect-dograh", connectDograhWorkflow);
router.get("/:agentId/dograh-binding", getDograhBindingForAgent);
router.put("/:agentId/dograh-binding", updateDograhBindingForAgent);
router.post("/:agentId/migrate-dograh", migrateDograhAgent);
router.get("/:agentId/migrate-dograh/status", getDograhMigrationStatus);
router.post("/:agentId/dograh/embed-token", createDograhAgentEmbedToken);
router.get("/:agentId/dograh/embed-token", getDograhAgentEmbedToken);
router.delete("/:agentId/dograh/embed-token", deleteDograhAgentEmbedToken);
router.post("/:id/create-dograh-workflow", createDograhWorkflowForAgent);
router.post("/:id/update-dograh-workflow", updateDograhWorkflowForAgent);
router.patch("/:id/dograh-workflow", updateDograhWorkflowForAgent);
router.patch("/:id/sync-provider", syncProviderForAgent);
router.patch("/:id/sync-runtime", syncDograhRuntimeForAgent);
router.post("/:id/test-call", triggerTestCall);
router.post("/:id/outbound-call", triggerOutboundCall);
router.get("/:id/calls", listAgentCalls);

export default router;
