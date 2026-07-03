import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Agent from "../models/Agent.js";
import Lead from "../models/Lead.js";
import { createAppointmentRecord } from "../services/appointment.service.js";
import { triggerOutboundCallForAgent } from "../services/outboundCall.service.js";
import { runCustomAgent } from "../services/customAgentRuntime.js";
import { normalizeLeadToEnglish } from "../services/leadEnglishNormalizer.js";
import { defaultBioPage } from "../services/bioPageTemplates.js";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const PUBLIC_AGENT_FILTER = {
  status: { $ne: "archived" },
  $or: [
    { isPublic: true },
    { status: { $in: ["Active", "active"] } }
  ]
};

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function requesterIp(req) {
  return (req.headers["x-forwarded-for"] || req.ip || req.socket?.remoteAddress || "unknown")
    .toString()
    .split(",")[0]
    .trim();
}

function bioPageAllowsWebCall(bioPage = {}) {
  return (bioPage.showVoiceCallButton ?? bioPage.showWebCallButton ?? bioPage.showWebCall) !== false;
}

function agentWebCallReady(agent) {
  return Boolean(agent.dograhWidgetEnabled && agent.dograhEmbedToken);
}

async function enforceCallbackLimits({ phoneNumber, ip }) {
  const since = todayStart();
  const [phoneCount, ipCount] = await Promise.all([
    Lead.countDocuments({ phone: phoneNumber, source: "callback_form", createdAt: { $gte: since } }),
    Lead.countDocuments({ source: "callback_form", "customFields.ip": ip, createdAt: { $gte: since } })
  ]);

  if (phoneCount >= 3 || ipCount >= 10) {
    throw new ApiError(429, "Too many callback requests. Please try again later.");
  }
}

function publicAgentResponse(agent) {
  const bioPage = { ...defaultBioPage(agent), ...(agent.bioPage?.toObject ? agent.bioPage.toObject() : agent.bioPage || {}) };
  const publicWebCallEnabled = Boolean(bioPageAllowsWebCall(bioPage) && agentWebCallReady(agent));

  return {
    _id: agent._id,
    name: agent.businessName || agent.agentName || agent.name,
    publicTitle: agent.publicTitle || agent.businessName || agent.agentName || agent.name,
    publicDescription: agent.publicDescription || agent.businessDescription || agent.description || "",
    publicWelcomeMessage: agent.publicWelcomeMessage || agent.greetingMessage || agent.firstMessage || "",
    publicChatEnabled: Boolean(agent.publicChatEnabled),
    publicWebCallEnabled,
    publicSlug: agent.publicSlug,
    agentName: agent.agentName,
    businessName: agent.businessName,
    businessCategory: agent.businessCategory,
    businessDescription: agent.businessDescription,
    businessLocation: agent.businessLocation,
    workingHours: agent.workingHours,
    contactNumber: agent.contactNumber,
    services: agent.services,
    bioPage
  };
}

async function getPublicAgentByIdOrSlug(idOrSlug) {
  const query = Agent.db.base.Types.ObjectId.isValid(idOrSlug)
    ? { _id: idOrSlug, ...PUBLIC_AGENT_FILTER }
    : { publicSlug: idOrSlug, ...PUBLIC_AGENT_FILTER };
  const agent = await Agent.findOne(query);
  if (!agent) throw new ApiError(404, "Public agent not found");
  return agent;
}

export const getPublicAgent = asyncHandler(async (req, res) => {
  const agent = await getPublicAgentByIdOrSlug(req.params.publicSlug);
  const bioPage = { ...defaultBioPage(agent), ...(agent.bioPage?.toObject ? agent.bioPage.toObject() : agent.bioPage || {}) };
  if (bioPage.isPublished === false) throw new ApiError(403, "This agent page is currently unavailable.");
  res.json(publicAgentResponse(agent));
});

// GET /public/agents/:publicSlug/web-call-config — returns what the Vapi Web SDK needs in the
// browser. Only the PUBLIC key is exposed here; VAPI_PRIVATE_KEY never reaches the client.
export const getWebCallConfig = asyncHandler(async (req, res) => {
  const agent = await Agent.findOne({ publicSlug: req.params.publicSlug });
  if (!agent || !agent.providerAgentId) {
    return res.status(404).json({ success: false, error: "Agent is not available for web calls yet." });
  }
  return res.status(200).json({
    success: true,
    publicKey: process.env.VAPI_PUBLIC_KEY,
    assistantId: agent.providerAgentId,
    agentName: agent.agentName,
    businessName: agent.businessName
  });
});

export const getPublicAgentBioPage = asyncHandler(async (req, res) => {
  const value = req.params.idOrSlug;
  const query = Agent.db.base.Types.ObjectId.isValid(value)
    ? { _id: value, ...PUBLIC_AGENT_FILTER }
    : { publicSlug: value, ...PUBLIC_AGENT_FILTER };
  const agent = await Agent.findOne(query);
  if (!agent) throw new ApiError(404, "Public agent not found");

  const bioPage = { ...defaultBioPage(agent), ...(agent.bioPage?.toObject ? agent.bioPage.toObject() : agent.bioPage || {}) };
  if (bioPage.isPublished === false) throw new ApiError(403, "This page is not published.");

  res.json({
    _id: agent._id,
    publicSlug: agent.publicSlug,
    businessName: agent.businessName,
    category: agent.businessCategory,
    description: agent.businessDescription || agent.description || "",
    publicTitle: agent.publicTitle || agent.businessName || agent.agentName || agent.name,
    publicDescription: agent.publicDescription || agent.businessDescription || agent.description || "",
    publicChatEnabled: Boolean(agent.publicChatEnabled),
    publicWebCallEnabled: Boolean(bioPageAllowsWebCall(bioPage) && agentWebCallReady(agent)),
    bioPage
  });
});

export const chatWithPublicAgent = asyncHandler(async (req, res) => {
  const { message, sessionId } = req.body;
  const agent = await getPublicAgentByIdOrSlug(req.params.publicSlug);

  if (!agent.publicChatEnabled) throw new ApiError(403, "Public chat is not enabled for this agent.");
  if (!message || !message.trim()) throw new ApiError(400, "Message is required.");

  const conversationId = `public:${agent._id.toString()}:${sessionId || requesterIp(req)}`;
  const reply = await runCustomAgent({
    systemPrompt: agent.systemPrompt,
    userMessage: message.trim(),
    conversationId,
    tools: agent.tools,
    settings: agent.settings,
    agent
  });

  res.json({
    success: true,
    reply,
    response: reply,
    sessionId: sessionId || conversationId
  });
});

export const getPublicWebCallToken = asyncHandler(async (req, res) => {
  const agent = await getPublicAgentByIdOrSlug(req.params.publicSlug);
  const bioPage = { ...defaultBioPage(agent), ...(agent.bioPage?.toObject ? agent.bioPage.toObject() : agent.bioPage || {}) };

  if (bioPage.isPublished === false) throw new ApiError(403, "This agent page is currently unavailable.");
  if (!bioPageAllowsWebCall(bioPage)) throw new ApiError(403, "Public web call is not enabled for this agent.");
  if (!agentWebCallReady(agent)) throw new ApiError(400, "Web call is not ready for this agent.");

  res.json({
    success: true,
    embedToken: agent.dograhEmbedToken
  });
});

export const requestCallbackCall = asyncHandler(async (req, res) => {
  const { name = "", phoneNumber, requirement = "", preferredTime = "" } = req.body;
  const agent = await Agent.findById(req.params.agentId);

  if (!agent) throw new ApiError(404, "Agent not found");
  if (!E164_PATTERN.test(phoneNumber || "")) {
    throw new ApiError(400, "Phone number must be in E.164 format, for example +918000281647.");
  }
  if (!agent.dograhWorkflowUuid) throw new ApiError(400, "AI callback is not ready for this agent.");
  if (!agent.callerIdNumber) throw new ApiError(400, "Caller ID number is not configured for this agent.");

  const ip = requesterIp(req);
  await enforceCallbackLimits({ phoneNumber, ip });

  const leadPayload = normalizeLeadToEnglish({
    userId: agent.userId,
    agentId: agent._id,
    name,
    phone: phoneNumber,
    requirement,
    preferredTime,
    source: "callback_form",
    status: "New",
    customFields: { ip }
  });

  const lead = await Lead.create(leadPayload);

  const { callLog } = await triggerOutboundCallForAgent({
    agent,
    userId: agent.userId,
    phoneNumber,
    leadId: lead._id,
    source: "callback_form",
    metadata: {
      customerName: leadPayload.name,
      phoneNumber,
      requirement: leadPayload.requirement,
      preferredTime: leadPayload.preferredTime,
      businessName: agent.businessName,
      agentName: agent.agentName,
      source: "callback_form"
    }
  });

  lead.callLogId = callLog._id;
  await lead.save();

  res.status(202).json({
    success: true,
    message: "AI assistant is calling you now.",
    lead,
    callLog
  });
});

export const createPublicAppointment = asyncHandler(async (req, res) => {
  const {
    name = "",
    phoneNumber = "",
    email = "",
    requirement = "",
    appointmentType = "consultation",
    date,
    time,
    timezone = "Asia/Calcutta",
    mode = "Online"
  } = req.body;
  const agent = await Agent.findById(req.params.agentId);

  if (!agent) throw new ApiError(404, "Agent not found");
  const bioPage = { ...defaultBioPage(agent), ...(agent.bioPage?.toObject ? agent.bioPage.toObject() : agent.bioPage || {}) };
  if (!agent.isPublic || agent.status === "archived" || bioPage.isPublished === false) {
    throw new ApiError(403, "This agent page is currently unavailable.");
  }
  if ((bioPage.showAppointmentButton ?? bioPage.showAppointment) === false) {
    throw new ApiError(403, "Appointment booking is not enabled for this agent.");
  }
  if (!date || !time) throw new ApiError(400, "Please select an appointment date and time.");
  if (!name.trim()) throw new ApiError(400, "Name is required.");
  if (!String(phoneNumber).trim()) throw new ApiError(400, "Phone number is required.");

  const leadPayload = normalizeLeadToEnglish({
    userId: agent.userId,
    agentId: agent._id,
    name,
    phone: phoneNumber,
    email,
    requirement,
    preferredDate: date,
    preferredTime: time,
    source: "public_appointment",
    status: "appointment_booked",
    customFields: { mode }
  });

  const lead = await Lead.create(leadPayload);
  const result = await createAppointmentRecord({
    userId: agent.userId,
    agent,
    lead,
    title: `${mode} appointment with ${lead.name || lead.phone || "lead"}`,
    appointmentType,
    date,
    time,
    timezone,
    customerName: lead.name,
    customerPhone: lead.phone,
    customerEmail: lead.email,
    notes: requirement ? `${requirement}\nMode: ${mode}` : `Mode: ${mode}`,
    source: "message",
    reminderEnabled: true
  });

  res.status(result.created ? 201 : 200).json({
    success: true,
    message: result.created ? "Appointment booked." : "Appointment already exists.",
    lead,
    appointment: result.appointment,
    meta: result.meta
  });
});
