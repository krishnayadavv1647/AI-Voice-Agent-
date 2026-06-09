import express from "express";
import { listBioPageTemplates } from "../controllers/agent.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(protect);
router.get("/templates", listBioPageTemplates);

export default router;
