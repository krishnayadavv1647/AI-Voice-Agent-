import express from "express";
import {
  connectDograhWorkflow,
  createDograhWorkflowForAgent,
  createDograhAgentEmbedToken,
  deleteDograhAgentEmbedToken,
  createAgent,
  getBioPage,
  getDograhAgentEmbedToken,
  getAgent,
  listBioPageTemplates,
  listAgentCalls,
  listAgents,
  pauseAgent,
  previewRegeneratedPrompt,
  publishAgent,
  publishBioPage,
  removeAgent,
  resetBioPage,
  syncProviderForAgent,
  testChatAgent,
  testAgent,
  triggerOutboundCall,
  triggerTestCall,
  updateAgent,
  updateBioPage,
  updateDograhWorkflowForAgent,
  updateShareSettings,
  unpublishBioPage,
  uploadBioPageCover,
  uploadBioPageAgentImage,
  uploadBioPageLogo,
  uploadBioPageTopicIcon
} from "../controllers/agent.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.route("/").post(createAgent).get(listAgents);
router.get("/bio-page/templates", listBioPageTemplates);
router.route("/:id").get(getAgent).put(updateAgent).delete(removeAgent);
router.get("/:id/bio-page", getBioPage);
router.patch("/:id/bio-page", updateBioPage);
router.put("/:id/bio-page", updateBioPage);
router.post("/:id/bio-page/reset", resetBioPage);
router.post("/:id/bio-page/publish", publishBioPage);
router.post("/:id/bio-page/unpublish", unpublishBioPage);
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
router.post("/:agentId/dograh/embed-token", createDograhAgentEmbedToken);
router.get("/:agentId/dograh/embed-token", getDograhAgentEmbedToken);
router.delete("/:agentId/dograh/embed-token", deleteDograhAgentEmbedToken);
router.post("/:id/create-dograh-workflow", createDograhWorkflowForAgent);
router.post("/:id/update-dograh-workflow", updateDograhWorkflowForAgent);
router.patch("/:id/dograh-workflow", updateDograhWorkflowForAgent);
router.patch("/:id/sync-provider", syncProviderForAgent);
router.post("/:id/test-call", triggerTestCall);
router.post("/:id/outbound-call", triggerOutboundCall);
router.get("/:id/calls", listAgentCalls);

export default router;
