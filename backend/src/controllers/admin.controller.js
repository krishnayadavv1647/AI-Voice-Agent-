import crypto from "crypto";
import Agent from "../models/Agent.js";
import Appointment from "../models/Appointment.js";
import AuditLog from "../models/AuditLog.js";
import CallLog from "../models/CallLog.js";
import EmailCampaign from "../models/EmailCampaign.js";
import EmailLog from "../models/EmailLog.js";
import FollowUp from "../models/FollowUp.js";
import Lead from "../models/Lead.js";
import LeadFinder from "../models/LeadFinder.js";
import User from "../models/User.js";
import { signToken } from "../utils/token.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const plans = {
  free: { maxAgents: 1, maxCallsPerMonth: 25, maxEmailsPerMonth: 25, maxLeadSearchesPerMonth: 10 },
  starter: { maxAgents: 3, maxCallsPerMonth: 250, maxEmailsPerMonth: 100, maxLeadSearchesPerMonth: 50 },
  pro: { maxAgents: 10, maxCallsPerMonth: 1000, maxEmailsPerMonth: 500, maxLeadSearchesPerMonth: 200 },
  agency: { maxAgents: 50, maxCallsPerMonth: 5000, maxEmailsPerMonth: 2000, maxLeadSearchesPerMonth: 1000 }
};

function searchRegex(value) {
  return value ? new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
}

function actorCanManage(actor, target) {
  if (!target) throw new ApiError(404, "User not found");
  if (actor.role === "super_admin") return true;
  if (target.role !== "user") throw new ApiError(403, "Only super admins can manage admins");
  return true;
}

function masked(value) {
  if (!value) return "";
  const text = String(value);
  if (text.length <= 8) return "********";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

async function audit(req, action, { targetUserId, resourceType, resourceId, description, metadata } = {}) {
  return AuditLog.create({
    actorUserId: req.user?._id,
    targetUserId,
    action,
    resourceType,
    resourceId,
    description,
    metadata,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"]
  });
}

async function countsByUser(Model, userIds, extra = {}) {
  const rows = await Model.aggregate([
    { $match: { userId: { $in: userIds }, ...extra } },
    { $group: { _id: "$userId", count: { $sum: 1 } } }
  ]);
  return Object.fromEntries(rows.map((row) => [String(row._id), row.count]));
}

async function usageForUser(userId) {
  const [agents, leads, calls, appointments, emailsSent, leadSearches] = await Promise.all([
    Agent.countDocuments({ userId }),
    Lead.countDocuments({ userId }),
    CallLog.countDocuments({ userId }),
    Appointment.countDocuments({ userId }),
    EmailLog.countDocuments({ userId, status: "sent" }),
    LeadFinder.countDocuments({ userId })
  ]);
  const callRows = await CallLog.find({ userId }).select("durationSeconds");
  const minutesUsed = Math.round(callRows.reduce((sum, call) => sum + (call.durationSeconds || 0), 0) / 60);
  return { agents, leads, calls, appointments, emailsSent, leadSearches, minutesUsed };
}

export const overview = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    totalAgents,
    activeAgents,
    totalCalls,
    completedCalls,
    failedCalls,
    totalLeads,
    appointmentsBooked,
    emailsSent,
    leadFinderRuns,
    users,
    recentActivity
  ] = await Promise.all([
    User.countDocuments({ status: { $ne: "deleted" } }),
    User.countDocuments({ status: "active" }),
    User.countDocuments({ status: "suspended" }),
    Agent.countDocuments(),
    Agent.countDocuments({ status: { $in: ["Active", "active", "Connected"] } }),
    CallLog.countDocuments(),
    CallLog.countDocuments({ normalizedStatus: { $in: ["completed", "answered"] } }),
    CallLog.countDocuments({ normalizedStatus: "failed" }),
    Lead.countDocuments(),
    Appointment.countDocuments(),
    EmailLog.countDocuments({ status: "sent" }),
    LeadFinder.countDocuments(),
    User.find().select("minutesUsed"),
    AuditLog.find().populate("actorUserId", "name email").populate("targetUserId", "name email").sort({ createdAt: -1 }).limit(20)
  ]);

  const calls = await CallLog.find().select("durationSeconds createdAt status normalizedStatus");
  const logs = await EmailLog.find().select("createdAt status");
  const userRows = await User.find({ status: { $ne: "deleted" } }).select("createdAt");
  const topUsers = await User.find({ status: { $ne: "deleted" } }).select("name email plan minutesUsed").sort({ minutesUsed: -1 }).limit(10);

  res.json({
    totalUsers,
    activeUsers,
    suspendedUsers,
    totalAgents,
    activeAgents,
    totalCalls,
    completedCalls,
    failedCalls,
    totalLeads,
    appointmentsBooked,
    emailsSent,
    leadFinderRuns,
    totalMinutesUsed: users.reduce((sum, user) => sum + (user.minutesUsed || 0), 0),
    creditsUsed: emailsSent + totalCalls + leadFinderRuns + appointmentsBooked,
    usersOverTime: userRows,
    callsOverTime: calls,
    emailUsageOverTime: logs,
    topUsers,
    recentActivity,
    systemErrors: calls.filter((call) => call.normalizedStatus === "failed").slice(0, 20)
  });
});

export const adminStats = overview;

export const listUsers = asyncHandler(async (req, res) => {
  const query = { status: { $ne: "deleted" } };
  const q = searchRegex(req.query.search);
  if (q) query.$or = [{ name: q }, { email: q }];
  if (req.query.status) query.status = req.query.status;
  if (req.query.role) query.role = req.query.role;
  if (req.query.plan) query.plan = req.query.plan;

  const users = await User.find(query).select("-password").sort({ createdAt: -1 }).lean();
  const ids = users.map((user) => user._id);
  const [agents, calls, leads, emails] = await Promise.all([
    countsByUser(Agent, ids),
    countsByUser(CallLog, ids),
    countsByUser(Lead, ids),
    countsByUser(EmailLog, ids, { status: "sent" })
  ]);

  res.json(users.map((user) => ({
    ...user,
    counts: {
      agents: agents[String(user._id)] || 0,
      calls: calls[String(user._id)] || 0,
      leads: leads[String(user._id)] || 0,
      emailsSent: emails[String(user._id)] || 0
    }
  })));
});

export const adminUsers = listUsers;

export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("-password").lean();
  actorCanManage(req.user, user);
  const usage = await usageForUser(user._id);
  res.json({ user, usage });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  actorCanManage(req.user, user);
  const allowed = ["name", "email", "status", "plan", "planStatus", "planStartedAt", "planExpiresAt"];
  if (req.body.role && req.user.role !== "super_admin") throw new ApiError(403, "Only super admins can change roles");
  if (req.body.role) allowed.push("role");
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) user[field] = req.body[field];
  });
  await user.save();
  await audit(req, "user_updated", { targetUserId: user._id, resourceType: "User", resourceId: user._id, metadata: req.body });
  res.json(await User.findById(user._id).select("-password"));
});

export const suspendUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  actorCanManage(req.user, user);
  user.status = "suspended";
  await user.save();
  await audit(req, "user_suspended", { targetUserId: user._id, resourceType: "User", resourceId: user._id });
  res.json({ success: true });
});

export const activateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  actorCanManage(req.user, user);
  user.status = "active";
  await user.save();
  await audit(req, "user_activated", { targetUserId: user._id, resourceType: "User", resourceId: user._id });
  res.json({ success: true });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  actorCanManage(req.user, user);
  const temporaryPassword = `Temp-${crypto.randomBytes(5).toString("hex")}`;
  user.password = temporaryPassword;
  user.authProvider = "local";
  await user.save();
  await audit(req, "password_reset", { targetUserId: user._id, resourceType: "User", resourceId: user._id });
  res.json({ success: true, temporaryPassword });
});

export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  actorCanManage(req.user, user);
  user.status = "deleted";
  user.deletedAt = new Date();
  await user.save();
  await audit(req, "user_deleted", { targetUserId: user._id, resourceType: "User", resourceId: user._id });
  res.json({ success: true });
});

export const impersonateUser = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id).select("-password");
  actorCanManage(req.user, target);
  if (target.role === "super_admin") throw new ApiError(403, "Super admin cannot be impersonated");
  const token = signToken(target, { impersonatedBy: req.user._id });
  await audit(req, "impersonation_started", { targetUserId: target._id, resourceType: "User", resourceId: target._id });
  res.json({ token, user: target });
});

export const stopImpersonation = asyncHandler(async (req, res) => {
  if (!req.impersonatedBy) return res.json({ success: true });
  const admin = await User.findById(req.impersonatedBy).select("-password");
  if (!admin) throw new ApiError(404, "Admin user not found");
  const token = signToken(admin);
  await audit({ ...req, user: admin }, "impersonation_stopped", { targetUserId: req.user._id });
  res.json({ token, user: admin });
});

function listFor(Model, populate = []) {
  return asyncHandler(async (req, res) => {
    let query = {};
    const q = searchRegex(req.query.search);
    if (req.query.userId) query.userId = req.query.userId;
    if (req.query.status) query.status = req.query.status;
    let request = Model.find(query).sort({ createdAt: -1 }).limit(Number(req.query.limit) || 200);
    populate.forEach((item) => { request = request.populate(item.path, item.select); });
    let rows = await request;
    if (q) {
      rows = rows.filter((row) => JSON.stringify(row).match(q));
    }
    res.json(rows);
  });
}

export const adminAgents = listFor(Agent, [{ path: "userId", select: "name email" }]);
export const adminCalls = listFor(CallLog, [{ path: "userId", select: "name email" }, { path: "agentId", select: "agentName businessName" }, { path: "leadId", select: "name businessName phone" }]);
export const adminLeads = listFor(Lead, [{ path: "userId", select: "name email" }, { path: "agentId", select: "agentName" }]);
export const adminAppointments = listFor(Appointment, [{ path: "userId", select: "name email" }, { path: "agentId", select: "agentName" }, { path: "leadId", select: "name businessName phone email" }]);
export const adminFollowUps = listFor(FollowUp, [{ path: "userId", select: "name email" }, { path: "agentId", select: "agentName" }, { path: "leadId", select: "name businessName phone" }]);
export const adminEmailCampaigns = listFor(EmailCampaign, [{ path: "userId", select: "name email" }, { path: "agentId", select: "agentName" }]);
export const adminEmailLogs = listFor(EmailLog, [{ path: "userId", select: "name email" }, { path: "campaignId", select: "name" }, { path: "leadId", select: "name businessName email" }]);

export const getUserResource = (Model, populate = []) => asyncHandler(async (req, res) => {
  let request = Model.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(200);
  populate.forEach((item) => { request = request.populate(item.path, item.select); });
  res.json(await request);
});

export const getUserUsage = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");
  if (!user) throw new ApiError(404, "User not found");
  res.json({ user, usage: await usageForUser(user._id) });
});

async function updateRecord(req, Model, action, fields) {
  const record = await Model.findById(req.params.id);
  if (!record) throw new ApiError(404, "Record not found");
  Object.entries(fields).forEach(([key, value]) => { record[key] = value; });
  await record.save();
  await audit(req, action, { targetUserId: record.userId, resourceType: Model.modelName, resourceId: record._id, metadata: fields });
  return record;
}

export const updateAgent = asyncHandler(async (req, res) => res.json(await updateRecord(req, Agent, "agent_updated", req.body)));
export const pauseAgent = asyncHandler(async (req, res) => res.json(await updateRecord(req, Agent, "agent_paused", { status: "Paused" })));
export const activateAgent = asyncHandler(async (req, res) => res.json(await updateRecord(req, Agent, "agent_activated", { status: "Active" })));
export const deleteAgent = asyncHandler(async (req, res) => res.json(await updateRecord(req, Agent, "agent_deleted", { status: "archived", archivedAt: new Date() })));
export const getCall = asyncHandler(async (req, res) => res.json(await CallLog.findById(req.params.id).populate("userId", "name email").populate("agentId", "agentName").populate("leadId")));
export const deleteCall = asyncHandler(async (req, res) => { const row = await updateRecord(req, CallLog, "call_deleted", { status: "deleted" }); res.json(row); });
export const updateLead = asyncHandler(async (req, res) => res.json(await updateRecord(req, Lead, "lead_updated", req.body)));
export const deleteLead = asyncHandler(async (req, res) => {
  const record = await Lead.findById(req.params.id);
  if (!record) throw new ApiError(404, "Record not found");
  await audit(req, "lead_deleted", { targetUserId: record.userId, resourceType: "Lead", resourceId: record._id });
  await record.deleteOne();
  res.json({ success: true });
});
export const exportLeads = asyncHandler(async (req, res) => res.json(await Lead.find().populate("userId", "name email").populate("agentId", "agentName")));
export const updateAppointment = asyncHandler(async (req, res) => res.json(await updateRecord(req, Appointment, "appointment_updated", req.body)));
export const cancelAppointment = asyncHandler(async (req, res) => res.json(await updateRecord(req, Appointment, "appointment_cancelled", { status: "cancelled" })));
export const completeAppointment = asyncHandler(async (req, res) => res.json(await updateRecord(req, Appointment, "appointment_completed", { status: "completed", completedAt: new Date() })));
export const updateFollowUp = asyncHandler(async (req, res) => res.json(await updateRecord(req, FollowUp, "followup_updated", req.body)));
export const cancelFollowUp = asyncHandler(async (req, res) => res.json(await updateRecord(req, FollowUp, "followup_cancelled", { status: "cancelled" })));
export const runFollowUpNow = asyncHandler(async (req, res) => res.json(await updateRecord(req, FollowUp, "followup_run_requested", { status: "pending", scheduledAt: new Date() })));

export const usage = asyncHandler(async (req, res) => {
  const users = await User.find({ status: { $ne: "deleted" } }).select("-password").lean();
  const rows = await Promise.all(users.map(async (user) => ({ user, usage: await usageForUser(user._id) })));
  res.json(rows);
});

export const updateCredits = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  actorCanManage(req.user, user);
  ["callCredits", "emailCredits", "leadFinderCredits", "appointmentCredits"].forEach((field) => {
    if (req.body[field] !== undefined) user.credits[field] = Number(req.body[field]) || 0;
  });
  await user.save();
  await audit(req, "credits_updated", { targetUserId: user._id, resourceType: "User", resourceId: user._id, metadata: req.body });
  res.json(await User.findById(user._id).select("-password"));
});

export const updateLimits = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  actorCanManage(req.user, user);
  ["maxAgents", "maxCallsPerMonth", "maxEmailsPerMonth", "maxLeadSearchesPerMonth", "monthlyCallLimit", "monthlyEmailLimit", "monthlyLeadFinderLimit"].forEach((field) => {
    if (req.body[field] !== undefined) user.limits[field] = Number(req.body[field]) || 0;
  });
  await user.save();
  await audit(req, "limits_updated", { targetUserId: user._id, resourceType: "User", resourceId: user._id, metadata: req.body });
  res.json(await User.findById(user._id).select("-password"));
});

export const updatePlan = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  actorCanManage(req.user, user);
  user.plan = req.body.plan || user.plan;
  user.planStatus = req.body.planStatus || user.planStatus || "active";
  user.planStartedAt = req.body.planStartedAt || user.planStartedAt || new Date();
  user.planExpiresAt = req.body.planExpiresAt || user.planExpiresAt;
  user.limits = { ...(user.limits || {}), ...(plans[user.plan] || {}), ...req.body.limits };
  await user.save();
  await audit(req, "plan_changed", { targetUserId: user._id, resourceType: "User", resourceId: user._id, metadata: req.body });
  res.json(await User.findById(user._id).select("-password"));
});

export const getIntegrationSettings = asyncHandler(async (req, res) => {
  res.json({
    dograhApiKey: masked(process.env.DOGRAH_API_KEY),
    dograhBaseUrl: process.env.DOGRAH_BASE_URL || "",
    brevoApiKey: masked(process.env.BREVO_API_KEY),
    fromEmail: process.env.FROM_EMAIL || "",
    fromName: process.env.FROM_NAME || "",
    geminiApiKey: masked(process.env.GEMINI_API_KEY),
    openaiApiKey: masked(process.env.OPENAI_API_KEY),
    twilioAccountSid: masked(process.env.TWILIO_ACCOUNT_SID),
    serpApiKey: masked(process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY),
    leadFinderProvider: process.env.LEAD_FINDER_PROVIDER || "mock"
  });
});

export const updateIntegrationSettings = asyncHandler(async (req, res) => {
  await audit(req, "integration_settings_updated", { resourceType: "IntegrationSettings", metadata: Object.keys(req.body) });
  res.json({ success: true, message: "Settings received. Persist secrets in your deployment environment before restart." });
});

export const auditLogs = asyncHandler(async (req, res) => {
  res.json(await AuditLog.find().populate("actorUserId", "name email").populate("targetUserId", "name email").sort({ createdAt: -1 }).limit(300));
});
