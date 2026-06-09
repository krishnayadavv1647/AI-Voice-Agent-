import axios from "axios";
import Agent from "../../models/Agent.js";
import Appointment from "../../models/Appointment.js";
import CallLog from "../../models/CallLog.js";
import EmailLog from "../../models/EmailLog.js";
import FollowUp from "../../models/FollowUp.js";
import Lead from "../../models/Lead.js";
import TelegramConnection from "../../models/TelegramConnection.js";
import User from "../../models/User.js";

let started = false;
let offset = 0;
const rateLimitByChat = new Map();
const AVAILABLE_COMMANDS = "Available commands:\n/summary, /agents, /agent, /today, /leads, /calls, /appointments, /followups";
const BOT_COMMANDS = [
  { command: "summary", description: "Show account summary" },
  { command: "agents", description: "List your agents" },
  { command: "agent", description: "Show agent details" },
  { command: "today", description: "Show today's activity" },
  { command: "leads", description: "Show recent leads" },
  { command: "calls", description: "Show recent calls" },
  { command: "appointments", description: "Show upcoming appointments" },
  { command: "followups", description: "Show pending follow-ups" }
];

function token() {
  return String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

function apiUrl(method) {
  return `https://api.telegram.org/bot${token()}/${method}`;
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return clean(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function line(label, value) {
  return `${label}: ${value}`;
}

function isObjectId(value) {
  return /^[a-f\d]{24}$/i.test(clean(value));
}

function publicLink(agent) {
  if (agent.shareableLink) return agent.shareableLink;
  if (!agent.publicSlug) return "Not enabled";
  const baseUrl = String(process.env.CLIENT_URL || process.env.PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/a/${agent.publicSlug}` : `/a/${agent.publicSlug}`;
}

function voiceLabel(agent) {
  return [agent.voiceProvider, agent.voiceId || agent.voiceGender || agent.voiceStyle].filter(Boolean).join(" / ") || "Default";
}

function telephonyLabel(agent) {
  return [agent.telephonyProvider, agent.callerIdNumber || agent.connectedPhoneNumber].filter(Boolean).join(" / ") || "Not connected";
}

function isRateLimited(chatId) {
  const now = Date.now();
  const current = rateLimitByChat.get(chatId) || { count: 0, resetAt: now + 60_000 };
  if (now > current.resetAt) {
    rateLimitByChat.set(chatId, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  rateLimitByChat.set(chatId, current);
  return current.count > 20;
}

async function sendMessage(chatId, text) {
  if (!token()) return;
  await axios.post(apiUrl("sendMessage"), {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  }, { timeout: 15000 });
}

async function connectedUser(chatId) {
  const connection = await TelegramConnection.findOne({ telegramChatId: String(chatId), status: "connected" });
  if (!connection) return null;
  const user = await User.findOne({ _id: connection.userId, status: "active" }).select("-password");
  return user ? { user, connection } : null;
}

async function requireConnected(chatId) {
  const context = await connectedUser(chatId);
  if (!context) {
    await sendMessage(chatId, "Please connect your account first. Open the app, generate a Telegram connect code, then send /connect YOUR_CODE.");
    return null;
  }
  return context;
}

async function findUserAgent(userId, value) {
  const query = clean(value);
  if (!query) return { agent: null, lookupType: "missing" };

  if (isObjectId(query)) {
    const agent = await Agent.findOne({ _id: query, userId });
    return { agent, lookupType: "object_id" };
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let agent = await Agent.findOne({
    userId,
    $or: [
      { agentName: { $regex: `^${escaped}$`, $options: "i" } },
      { name: { $regex: `^${escaped}$`, $options: "i" } }
    ]
  });
  if (agent) return { agent, lookupType: "exact_name" };

  agent = await Agent.findOne({
    userId,
    $or: [
      { agentName: { $regex: escaped, $options: "i" } },
      { name: { $regex: escaped, $options: "i" } }
    ]
  });
  return { agent, lookupType: "partial_name" };
}

async function connect(chat, code) {
  const normalized = clean(code).toUpperCase();
  const connection = await TelegramConnection.findOne({ connectCode: normalized, status: "pending" }).sort({ createdAt: -1 });
  if (!connection) {
    await sendMessage(chat.id, "Invalid or expired connect code. Generate a new code in Settings > Telegram Integration.");
    return;
  }
  if (Date.now() - new Date(connection.createdAt).getTime() > 15 * 60 * 1000) {
    connection.status = "revoked";
    connection.revokedAt = new Date();
    await connection.save();
    await sendMessage(chat.id, "This connect code expired. Generate a new code in Settings > Telegram Integration.");
    return;
  }

  connection.telegramChatId = String(chat.id);
  connection.telegramUsername = chat.username || [chat.first_name, chat.last_name].filter(Boolean).join(" ");
  connection.status = "connected";
  connection.connectedAt = new Date();
  await connection.save();

  await sendMessage(chat.id, "Telegram connected successfully. Try /summary, /agents, /agent AGENT_ID, /leads, /calls, /appointments, or /followups.");
}

async function agents(chatId) {
  const context = await requireConnected(chatId);
  if (!context) return;
  const rows = await Agent.find({ userId: context.user._id }).sort({ createdAt: -1 }).limit(10);
  if (!rows.length) return sendMessage(chatId, "No agents found.");
  await sendMessage(chatId, `<b>Your Agents</b>\n\n${rows.map((agent, index) => [
    `${index + 1}. ${escapeHtml(agent.agentName || agent.name || "Agent")}`,
    `ID: ${agent._id}`,
    `Status: ${escapeHtml(agent.status || "draft")}`,
    `Category: ${escapeHtml(agent.businessCategory || agent.businessName || "Not provided")}`
  ].join("\n")).join("\n\n")}\n\nUse:\n/agent ${rows[0]._id}`);
}

async function summary(chatId) {
  const context = await requireConnected(chatId);
  if (!context) return;
  const { start, end } = todayRange();
  const [agentCount, callsToday, answered, leadsToday, appointmentsToday, pendingFollowUps] = await Promise.all([
    Agent.countDocuments({ userId: context.user._id }),
    CallLog.countDocuments({ userId: context.user._id, createdAt: { $gte: start, $lt: end } }),
    CallLog.countDocuments({ userId: context.user._id, createdAt: { $gte: start, $lt: end }, normalizedStatus: { $in: ["answered", "completed"] } }),
    Lead.countDocuments({ userId: context.user._id, createdAt: { $gte: start, $lt: end } }),
    Appointment.countDocuments({ userId: context.user._id, createdAt: { $gte: start, $lt: end } }),
    FollowUp.countDocuments({ userId: context.user._id, status: { $in: ["pending", "scheduled"] } })
  ]);

  await sendMessage(chatId, `<b>AI Voice Agent Summary</b>\n\n${[
    line("Agents", agentCount),
    line("Calls Today", callsToday),
    line("Answered", answered),
    line("Leads Today", leadsToday),
    line("Appointments", appointmentsToday),
    line("Pending Follow-ups", pendingFollowUps)
  ].join("\n")}\n\nUse /agents to view agent list.`);
}

async function summaryAgent(chatId, query) {
  const context = await requireConnected(chatId);
  if (!context) return;
  if (!clean(query)) return sendMessage(chatId, "Send /summary_agent AGENT_NAME_OR_ID");
  const { agent } = await findUserAgent(context.user._id, query);
  if (!agent) return sendMessage(chatId, "Agent not found.");
  const { start, end } = todayRange();
  const match = { userId: context.user._id, agentId: agent._id, createdAt: { $gte: start, $lt: end } };
  const [calls, answered, missed, leads, appointments, followups, emails] = await Promise.all([
    CallLog.countDocuments(match),
    CallLog.countDocuments({ ...match, normalizedStatus: { $in: ["answered", "completed"] } }),
    CallLog.countDocuments({ ...match, normalizedStatus: { $in: ["declined", "no_answer", "failed", "busy"] } }),
    Lead.countDocuments(match),
    Appointment.countDocuments(match),
    FollowUp.countDocuments({ userId: context.user._id, agentId: agent._id, status: { $in: ["pending", "scheduled"] } }),
    EmailLog.countDocuments({ userId: context.user._id, status: "sent", createdAt: { $gte: start, $lt: end } })
  ]);
  await sendMessage(chatId, `<b>${escapeHtml(agent.agentName)} Summary</b>\n\n${[
    line("Calls Today", calls),
    line("Answered", answered),
    line("Missed/Declined", missed),
    line("Leads Captured", leads),
    line("Appointments Booked", appointments),
    line("Pending Follow-ups", followups),
    line("Emails Sent", emails)
  ].join("\n")}`);
}

async function agentDetails(chatId, query) {
  console.info("[telegram] /agent command received", { chatId, query: clean(query) });
  const context = await requireConnected(chatId);
  if (!context) return;
  console.info("[telegram] connected user found", { chatId, userId: String(context.user._id) });

  if (!clean(query)) {
    return sendMessage(chatId, "Please provide an agent ID or name.\n\nExample:\n/agent 64abc123\nor\n/agent Coaching Inquiry");
  }

  const { start, end } = todayRange();
  const { agent, lookupType } = await findUserAgent(context.user._id, query);
  console.info("[telegram] agent lookup", { chatId, userId: String(context.user._id), lookupType });

  if (!agent) {
    console.info("[telegram] agent not found", { chatId, query: clean(query), lookupType });
    return sendMessage(chatId, "Agent not found. Use /agents to see your available agents.");
  }

  console.info("[telegram] agent found", { chatId, userId: String(context.user._id), agentId: String(agent._id), lookupType });

  const todayMatch = { userId: context.user._id, agentId: agent._id, createdAt: { $gte: start, $lt: end } };
  const [callsToday, totalCalls, leadsToday, totalLeads, appointmentsToday, upcomingAppointments, pendingFollowups, lastCall] = await Promise.all([
    CallLog.countDocuments(todayMatch),
    CallLog.countDocuments({ userId: context.user._id, agentId: agent._id }),
    Lead.countDocuments(todayMatch),
    Lead.countDocuments({ userId: context.user._id, agentId: agent._id }),
    Appointment.countDocuments(todayMatch),
    Appointment.countDocuments({ userId: context.user._id, agentId: agent._id, startAt: { $gt: new Date() }, status: "scheduled" }),
    FollowUp.countDocuments({ userId: context.user._id, agentId: agent._id, status: { $in: ["pending", "scheduled"] } }),
    CallLog.findOne({ userId: context.user._id, agentId: agent._id }).sort({ createdAt: -1 })
  ]);

  await sendMessage(chatId, `<b>Agent Details</b>\n\n${[
    line("Name", escapeHtml(agent.agentName || agent.name || "Agent")),
    line("Business", escapeHtml(agent.businessName || "Not provided")),
    line("Category", escapeHtml(agent.businessCategory || "Not provided")),
    line("Status", escapeHtml(agent.status || "draft")),
    line("Language", escapeHtml(agent.language || "Not provided")),
    line("Voice", escapeHtml(voiceLabel(agent))),
    line("Telephony", escapeHtml(telephonyLabel(agent))),
    line("Public Link", escapeHtml(publicLink(agent)))
  ].join("\n")}\n\n<b>Stats</b>\n${[
    line("Calls Today", callsToday),
    line("Total Calls", totalCalls),
    line("Leads Today", leadsToday),
    line("Total Leads", totalLeads),
    line("Appointments Today", appointmentsToday),
    line("Upcoming Appointments", upcomingAppointments),
    line("Pending Follow-ups", pendingFollowups),
    line("Last Call", lastCall ? `${escapeHtml(lastCall.normalizedStatus || lastCall.status || "logged")} - ${lastCall.createdAt.toLocaleString()}` : "No calls yet")
  ].join("\n")}\n\n<b>Useful commands</b>\n/summary_agent ${agent._id}\n/calls_agent ${agent._id}\n/leads_agent ${agent._id}\n/appointments_agent ${agent._id}`);
}

async function today(chatId) {
  const context = await requireConnected(chatId);
  if (!context) return;
  const { start, end } = todayRange();
  const [calls, leads, appointments, followups] = await Promise.all([
    CallLog.countDocuments({ userId: context.user._id, createdAt: { $gte: start, $lt: end } }),
    Lead.countDocuments({ userId: context.user._id, createdAt: { $gte: start, $lt: end } }),
    Appointment.countDocuments({ userId: context.user._id, createdAt: { $gte: start, $lt: end } }),
    FollowUp.countDocuments({ userId: context.user._id, scheduledAt: { $gte: start, $lt: end } })
  ]);
  await sendMessage(chatId, `<b>Today's Activity</b>\n\n${[line("Calls", calls), line("Leads", leads), line("Appointments", appointments), line("Follow-ups", followups)].join("\n")}`);
}

async function latest(chatId, type) {
  const context = await requireConnected(chatId);
  if (!context) return;
  const configs = {
    leads: [Lead, {}, "Latest Leads", (row) => `${escapeHtml(row.name || row.businessName || row.phone || "Lead")} - ${escapeHtml(row.status || "new")}`],
    calls: [CallLog, {}, "Latest Calls", (row) => `${escapeHtml(row.callerNumber || "Unknown")} - ${escapeHtml(row.normalizedStatus || row.status || "logged")}`],
    appointments: [Appointment, { startAt: { $gte: new Date() } }, "Upcoming Appointments", (row) => `${escapeHtml(row.customerName || row.title || "Appointment")} - ${row.startAt ? row.startAt.toLocaleString() : "scheduled"}`],
    followups: [FollowUp, { status: { $in: ["pending", "scheduled"] } }, "Pending Follow-ups", (row) => `${escapeHtml(row.type || "follow-up")} - ${row.scheduledAt ? row.scheduledAt.toLocaleString() : "pending"}`]
  };
  const [Model, extra, title, formatter] = configs[type];
  const rows = await Model.find({ userId: context.user._id, ...extra }).sort({ createdAt: -1 }).limit(5);
  if (!rows.length) return sendMessage(chatId, `No ${type} found.`);
  await sendMessage(chatId, `<b>${title}</b>\n\n${rows.map((row, index) => `${index + 1}. ${formatter(row)}`).join("\n")}`);
}

async function handleText(message) {
  const chat = message.chat;
  const text = clean(message.text);
  if (!chat?.id || !text) return;
  if (isRateLimited(chat.id)) return sendMessage(chat.id, "Too many Telegram requests. Please wait a minute and try again.");

  const [command, ...parts] = text.split(/\s+/);
  const commandName = command.split("@")[0].toLowerCase();
  const arg = parts.join(" ");

  try {
    if (commandName === "/start") return sendMessage(chat.id, "Welcome. To connect your account, open the app, generate Telegram connect code, then send /connect YOUR_CODE");
    if (commandName === "/connect") return connect(chat, arg);
    if (commandName === "/agents") return agents(chat.id);
    if (commandName === "/agent") return agentDetails(chat.id, arg);
    if (commandName === "/summary") return summary(chat.id);
    if (commandName === "/summary_agent") return summaryAgent(chat.id, arg);
    if (commandName === "/today") return today(chat.id);
    if (commandName === "/leads") return latest(chat.id, "leads");
    if (commandName === "/calls") return latest(chat.id, "calls");
    if (commandName === "/appointments") return latest(chat.id, "appointments");
    if (commandName === "/followups") return latest(chat.id, "followups");
    return sendMessage(chat.id, AVAILABLE_COMMANDS);
  } catch (error) {
    console.error("Telegram command failed:", error.message);
    return sendMessage(chat.id, "Telegram command failed. Please try again.");
  }
}

async function startNodeTelegramBot() {
  const TelegramBot = (await import("node-telegram-bot-api")).default;
  const bot = new TelegramBot(token(), { polling: true });
  await bot.setMyCommands(BOT_COMMANDS);
  bot.on("message", handleText);
  console.log("Telegram bot started with node-telegram-bot-api");
  return bot;
}

async function setCommandsWithAxios() {
  await axios.post(apiUrl("setMyCommands"), { commands: BOT_COMMANDS }, { timeout: 15000 });
}

async function pollWithAxios() {
  while (started && token()) {
    try {
      const response = await axios.get(apiUrl("getUpdates"), {
        params: { timeout: 25, offset },
        timeout: 30000
      });
      for (const update of response.data?.result || []) {
        offset = update.update_id + 1;
        if (update.message) await handleText(update.message);
      }
    } catch (error) {
      console.error("Telegram polling error:", error.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export async function startTelegramBot() {
  if (started || !token()) return null;
  started = true;
  try {
    await setCommandsWithAxios();
  } catch (error) {
    console.warn("Telegram setMyCommands failed:", error.message);
  }
  try {
    return await startNodeTelegramBot();
  } catch (error) {
    console.warn("node-telegram-bot-api unavailable, using axios Telegram polling fallback:", error.message);
    pollWithAxios();
    return null;
  }
}
