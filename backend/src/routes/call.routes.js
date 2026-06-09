import express from "express";
import { deleteCall, extractLeadForCall, getCall, listCalls, retryCall, syncCall, syncCallByRun } from "../controllers/call.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(protect);
router.get("/", listCalls);
router.post("/sync-by-run", syncCallByRun);
router.post("/:id/extract-lead", extractLeadForCall);
router.post("/:id/sync", syncCall);
router.post("/:id/retry", retryCall);
router.get("/:id", getCall);
router.delete("/:id", deleteCall);

export default router;
