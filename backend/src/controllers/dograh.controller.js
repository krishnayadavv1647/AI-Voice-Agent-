import { asyncHandler } from "../utils/asyncHandler.js";
import { fetchDograhWorkflows, getDograhDebugInfo, getDograhWorkflow } from "../services/dograh.service.js";

export const dograhDebug = asyncHandler(async (req, res) => {
  res.json(getDograhDebugInfo());
});

export const listDograhWorkflows = asyncHandler(async (req, res) => {
  res.json(await fetchDograhWorkflows());
});

export const readDograhWorkflow = asyncHandler(async (req, res) => {
  res.json(await getDograhWorkflow(req.params.workflowId));
});
