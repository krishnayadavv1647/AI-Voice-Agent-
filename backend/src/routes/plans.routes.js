import express from "express";
import { listPlansForUser } from "../controllers/planCatalog.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();
router.use(protect);
router.get("/", listPlansForUser);

export default router;
