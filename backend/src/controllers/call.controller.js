import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import CallLog from "../models/CallLog.js";

function filter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
}

export const listCalls = asyncHandler(async (req, res) => {
  const calls = await CallLog.find(filter(req)).populate("agentId", "agentName").sort({ createdAt: -1 });
  res.json(calls);
});

export const getCall = asyncHandler(async (req, res) => {
  const call = await CallLog.findOne({ _id: req.params.id, ...filter(req) }).populate("agentId", "agentName");
  if (!call) throw new ApiError(404, "Call log not found");
  res.json(call);
});

export const deleteCall = asyncHandler(async (req, res) => {
  const call = await CallLog.findOne({ _id: req.params.id, ...filter(req) });
  if (!call) throw new ApiError(404, "Call log not found");
  await call.deleteOne();
  res.json({ message: "Call log deleted" });
});
