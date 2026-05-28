import express from "express";
import { createKnowledge, deleteKnowledge, getKnowledge, listKnowledge, updateKnowledge } from "../controllers/knowledge.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(protect);
router.route("/").post(createKnowledge).get(listKnowledge);
router.route("/:id").get(getKnowledge).put(updateKnowledge).delete(deleteKnowledge);

export default router;
