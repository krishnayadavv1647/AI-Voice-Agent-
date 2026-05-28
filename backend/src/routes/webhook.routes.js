import express from "express";
import { dograhWebhook } from "../controllers/webhook.controller.js";

const router = express.Router();
router.post("/dograh", dograhWebhook);

export default router;
