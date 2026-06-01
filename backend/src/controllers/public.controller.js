import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import { extractRunId } from "../services/callLogMapper.js";
import { triggerDograhOutboundCallByWorkflow } from "../services/dograh.service.js";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

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

  const lead = await Lead.create({
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

  const payload = {
    phone_number: phoneNumber,
    calling_number: agent.callerIdNumber,
    initial_context: {
      customerName: name,
      phoneNumber,
      requirement,
      preferredTime,
      businessName: agent.businessName,
      agentName: agent.agentName,
      localAgentId: agent._id.toString()
    },
    metadata: {
      localAgentId: agent._id.toString(),
      leadId: lead._id.toString(),
      source: "callback_form"
    }
  };

  const dograhResponse = await triggerDograhOutboundCallByWorkflow(agent.dograhWorkflowUuid, payload);
  const dograhRunId = extractRunId(dograhResponse);

  const callLog = await CallLog.create({
    userId: agent.userId,
    agentId: agent._id,
    leadId: lead._id,
    source: "callback_form",
    callDirection: "outbound",
    callerNumber: phoneNumber,
    callingNumber: agent.callerIdNumber,
    dograhWorkflowId: agent.dograhWorkflowId,
    dograhWorkflowUuid: agent.dograhWorkflowUuid,
    dograhRunId: dograhRunId ? String(dograhRunId) : null,
    status: dograhResponse?.status || "initiated",
    rawDograhPayload: dograhResponse,
    startedAt: new Date()
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
