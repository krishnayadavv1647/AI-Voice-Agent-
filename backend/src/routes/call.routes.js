import express from "express";
import { deleteCall, getCall, listCalls } from "../controllers/call.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(protect);
router.get("/", listCalls);
router.get("/:id", getCall);
router.delete("/:id", deleteCall);

export default router;
