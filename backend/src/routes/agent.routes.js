import express from "express";
import {
  connectDograhWorkflow,
  createDograhWorkflowForAgent,
  createAgent,
  getAgent,
  listAgentCalls,
  listAgents,
  pauseAgent,
  previewRegeneratedPrompt,
  publishAgent,
  removeAgent,
  saveDograhWidget,
  syncProviderForAgent,
  testChatAgent,
  testAgent,
  triggerOutboundCall,
  triggerTestCall,
  updateAgent,
  updateDograhWorkflowForAgent
} from "../controllers/agent.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.route("/").post(createAgent).get(listAgents);
router.route("/:id").get(getAgent).put(updateAgent).delete(removeAgent);
router.post("/:id/regenerate-prompt-preview", previewRegeneratedPrompt);
router.post("/:id/test", testAgent);
router.post("/:id/test-chat", testChatAgent);
router.post("/:id/publish", publishAgent);
router.post("/:id/pause", pauseAgent);
router.post("/:id/connect-dograh", connectDograhWorkflow);
router.post("/:agentId/dograh-widget", saveDograhWidget);
router.post("/:id/create-dograh-workflow", createDograhWorkflowForAgent);
router.post("/:id/update-dograh-workflow", updateDograhWorkflowForAgent);
router.patch("/:id/dograh-workflow", updateDograhWorkflowForAgent);
router.patch("/:id/sync-provider", syncProviderForAgent);
router.post("/:id/test-call", triggerTestCall);
router.post("/:id/outbound-call", triggerOutboundCall);
router.get("/:id/calls", listAgentCalls);

export default router;
