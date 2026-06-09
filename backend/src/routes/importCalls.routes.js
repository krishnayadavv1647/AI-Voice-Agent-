import express from "express";
import {
  downloadErrorRows,
  getImportRun,
  importRows,
  listImportRuns,
  uploadImportFile,
  validateImportRun
} from "../controllers/importCalls.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);
router.post("/upload", express.raw({ type: "*/*", limit: "10mb" }), uploadImportFile);
router.get("/runs", listImportRuns);
router.post("/:runId/validate", validateImportRun);
router.post("/:runId/import", importRows);
router.get("/:runId/errors", downloadErrorRows);
router.get("/:runId", getImportRun);

export default router;
