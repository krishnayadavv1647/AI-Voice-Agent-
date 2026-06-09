import ImportedCallRow from "../models/ImportedCallRow.js";
import ImportRun from "../models/ImportRun.js";
import {
  createRunFromRows,
  importValidRows,
  parseImportFile,
  rowsToCsv,
  validateRun
} from "../services/importCalls.service.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function filter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
}

async function ownedRun(req) {
  const run = await ImportRun.findOne({ _id: req.params.runId, ...filter(req) }).populate("agentId", "agentName");
  if (!run) throw new ApiError(404, "Import run not found.");
  return run;
}

export const uploadImportFile = asyncHandler(async (req, res) => {
  const agentId = req.query.agentId || req.headers["x-agent-id"];
  const fileName = req.query.fileName || req.headers["x-file-name"] || "import.csv";
  if (!agentId) throw new ApiError(400, "agentId is required.");
  if (!req.body?.length) throw new ApiError(400, "Upload a CSV or XLSX file.");

  const rows = await parseImportFile({
    buffer: Buffer.from(req.body),
    fileName,
    contentType: req.headers["content-type"] || ""
  });
  if (!rows.length) throw new ApiError(400, "File has no rows.");

  const result = await createRunFromRows({
    userId: req.user._id,
    agentId,
    fileName,
    rows
  });
  const storedRows = await ImportedCallRow.find({ importRunId: result.run._id, userId: req.user._id }).sort({ createdAt: 1 }).limit(200);
  res.status(201).json({ ...result, rows: storedRows });
});

export const validateImportRun = asyncHandler(async (req, res) => {
  const run = await validateRun({
    userId: req.user._id,
    runId: req.params.runId,
    mapping: req.body?.mapping || {}
  });
  const rows = await ImportedCallRow.find({ importRunId: run._id, userId: req.user._id }).sort({ createdAt: 1 }).limit(500);
  res.json({ run, rows });
});

export const importRows = asyncHandler(async (req, res) => {
  await ownedRun(req);
  res.json(await importValidRows({ userId: req.user._id, runId: req.params.runId }));
});

export const listImportRuns = asyncHandler(async (req, res) => {
  const runs = await ImportRun.find(filter(req)).populate("agentId", "agentName").sort({ createdAt: -1 }).limit(100);
  res.json(runs);
});

export const getImportRun = asyncHandler(async (req, res) => {
  const run = await ownedRun(req);
  const rows = await ImportedCallRow.find({ importRunId: run._id, ...filter(req) }).sort({ createdAt: 1 }).limit(1000);
  res.json({ run, rows });
});

export const downloadErrorRows = asyncHandler(async (req, res) => {
  const run = await ownedRun(req);
  const rows = await ImportedCallRow.find({
    importRunId: run._id,
    ...filter(req),
    status: { $in: ["invalid", "skipped"] }
  }).sort({ createdAt: 1 });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${run.fileName || "import"}-errors.csv"`);
  res.send(rowsToCsv(rows));
});
