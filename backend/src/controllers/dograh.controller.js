import { asyncHandler } from "../utils/asyncHandler.js";
import { fetchDograhWorkflows, getDograhDebugInfo, getDograhWorkflow } from "../services/dograh.service.js";

export const dograhDebug = asyncHandler(async (req, res) => {
  res.json(await getDograhDebugInfo(req.user._id));
});

export const listDograhWorkflows = asyncHandler(async (req, res) => {
  res.json(await fetchDograhWorkflows(req.user._id));
});

export const readDograhWorkflow = asyncHandler(async (req, res) => {
  res.json(await getDograhWorkflow(req.params.workflowId, { userId: req.user._id }));
});
