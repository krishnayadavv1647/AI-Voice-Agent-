import express from "express";
import {
  connectDograhWorkflow,
  createAgent,
  getAgent,
  listAgentCalls,
  listAgents,
  pauseAgent,
  publishAgent,
  removeAgent,
  testAgent,
  triggerOutboundCall,
  triggerTestCall,
  updateAgent
} from "../controllers/agent.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.route("/").post(createAgent).get(listAgents);
router.route("/:id").get(getAgent).put(updateAgent).delete(removeAgent);
router.post("/:id/test", testAgent);
router.post("/:id/publish", publishAgent);
router.post("/:id/pause", pauseAgent);
router.post("/:id/connect-dograh", connectDograhWorkflow);
router.post("/:id/test-call", triggerTestCall);
router.post("/:id/outbound-call", triggerOutboundCall);
router.get("/:id/calls", listAgentCalls);

export default router;
