import { asyncHandler } from "../utils/asyncHandler.js";
import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import User from "../models/User.js";

export const adminStats = asyncHandler(async (req, res) => {
  const [totalUsers, totalAgents, activeAgents, totalCalls, totalLeads, users] = await Promise.all([
    User.countDocuments(),
    Agent.countDocuments(),
    Agent.countDocuments({ status: "Active" }),
    CallLog.countDocuments(),
    Lead.countDocuments(),
    User.find().select("minutesUsed")
  ]);

  res.json({
    totalUsers,
    totalAgents,
    activeAgents,
    totalCalls,
    totalLeads,
    totalMinutesUsed: users.reduce((sum, user) => sum + (user.minutesUsed || 0), 0)
  });
});

export const adminUsers = asyncHandler(async (req, res) => {
  res.json(await User.find().select("-password").sort({ createdAt: -1 }));
});

export const adminAgents = asyncHandler(async (req, res) => {
  res.json(await Agent.find().populate("userId", "name email").sort({ createdAt: -1 }));
});

export const adminCalls = asyncHandler(async (req, res) => {
  res.json(await CallLog.find().populate("userId", "name email").populate("agentId", "agentName").sort({ createdAt: -1 }));
});

export const adminLeads = asyncHandler(async (req, res) => {
  res.json(await Lead.find().populate("userId", "name email").populate("agentId", "agentName").sort({ createdAt: -1 }));
});
