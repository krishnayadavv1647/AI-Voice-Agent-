import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import KnowledgeBase from "../models/KnowledgeBase.js";

function filter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
}

export const createKnowledge = asyncHandler(async (req, res) => {
  if (!req.body.title || !req.body.content) throw new ApiError(400, "Title and content are required");
  const entry = await KnowledgeBase.create({ ...req.body, userId: req.user._id });
  res.status(201).json(entry);
});

export const listKnowledge = asyncHandler(async (req, res) => {
  const entries = await KnowledgeBase.find(filter(req)).populate("agentId", "agentName").sort({ createdAt: -1 });
  res.json(entries);
});

export const getKnowledge = asyncHandler(async (req, res) => {
  const entry = await KnowledgeBase.findOne({ _id: req.params.id, ...filter(req) });
  if (!entry) throw new ApiError(404, "Knowledge entry not found");
  res.json(entry);
});

export const updateKnowledge = asyncHandler(async (req, res) => {
  const entry = await KnowledgeBase.findOne({ _id: req.params.id, ...filter(req) });
  if (!entry) throw new ApiError(404, "Knowledge entry not found");
  Object.assign(entry, req.body);
  await entry.save();
  res.json(entry);
});

export const deleteKnowledge = asyncHandler(async (req, res) => {
  const entry = await KnowledgeBase.findOne({ _id: req.params.id, ...filter(req) });
  if (!entry) throw new ApiError(404, "Knowledge entry not found");
  await entry.deleteOne();
  res.json({ message: "Knowledge entry deleted" });
});
