import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";

function lastTwelveDayBuckets() {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setDate(start.getDate() - 11);
  start.setHours(0, 0, 0, 0);

  const buckets = [];
  for (let index = 0; index < 12; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    buckets.push({
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en", { month: "short", day: "numeric" }),
      count: 0
    });
  }

  return { start, end, buckets };
}

export async function getDashboard(user) {
  const filter = ["admin", "super_admin"].includes(user.role) ? {} : { userId: user._id };
  const { start, end, buckets } = lastTwelveDayBuckets();
  const outboundFilter = {
    ...filter,
    createdAt: { $gte: start, $lte: end },
    $or: [
      { callDirection: "outbound" },
      { source: { $in: ["dograh", "campaign", "import", "lead_call_again", "callback_form"] } }
    ]
  };

  const [totalAgents, activeAgents, totalCalls, totalLeads, recentAgents, recentCalls, recentLeads, outboundRows] = await Promise.all([
    Agent.countDocuments(filter),
    Agent.countDocuments({ ...filter, status: { $in: ["Active", "active", "Connected"] } }),
    CallLog.countDocuments(filter),
    Lead.countDocuments(filter),
    Agent.find(filter).sort({ createdAt: -1 }).limit(5),
    CallLog.find(filter).populate("agentId", "agentName").sort({ createdAt: -1 }).limit(5),
    Lead.find(filter).populate("agentId", "agentName").sort({ createdAt: -1 }).limit(5),
    CallLog.aggregate([
      { $match: outboundFilter },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const countsByDay = Object.fromEntries(outboundRows.map((row) => [row._id, row.count]));
  const outboundCallVolume = buckets.map((bucket) => ({ ...bucket, count: countsByDay[bucket.key] || 0 }));

  return {
    stats: {
      totalAgents,
      activeAgents,
      totalCalls,
      totalLeads,
      minutesUsed: user.minutesUsed || 0
    },
    outboundCallVolume,
    recentAgents,
    recentCalls,
    recentLeads
  };
}
