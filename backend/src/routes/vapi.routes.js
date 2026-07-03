import { Router } from "express";

import { vapiChatCompletions } from "../controllers/vapiChat.controller.js";
import { vapiWebhook } from "../controllers/vapiWebhook.controller.js";

const router = Router();

router.post("/chat/completions", vapiChatCompletions);
router.post("/webhook", vapiWebhook);

export default router;
