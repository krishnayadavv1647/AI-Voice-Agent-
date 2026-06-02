import express from "express";
import { requestCallbackCall } from "../controllers/public.controller.js";

const router = express.Router();

router.post("/agents/:agentId/request-call", requestCallbackCall);

export default router;
