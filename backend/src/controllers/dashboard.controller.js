import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";

export async function getDashboard(user) {
  const filter = ["admin", "super_admin"].includes(user.role) ? {} : { userId: user._id };
  const [totalAgents, activeAgents, totalCalls, totalLeads, recentAgents, recentCalls, recentLeads] = await Promise.all([
    Agent.countDocuments(filter),
    Agent.countDocuments({ ...filter, status: { $in: ["Active", "active", "Connected"] } }),
    CallLog.countDocuments(filter),
    Lead.countDocuments(filter),
    Agent.find(filter).sort({ createdAt: -1 }).limit(5),
    CallLog.find(filter).populate("agentId", "agentName").sort({ createdAt: -1 }).limit(5),
    Lead.find(filter).populate("agentId", "agentName").sort({ createdAt: -1 }).limit(5)
  ]);

  return {
    stats: {
      totalAgents,
      activeAgents,
      totalCalls,
      totalLeads,
      minutesUsed: user.minutesUsed || 0
    },
    recentAgents,
    recentCalls,
    recentLeads
  };
}
