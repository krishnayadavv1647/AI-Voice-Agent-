import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Agent from "../models/Agent.js";
import CallLog from "../models/CallLog.js";
import Lead from "../models/Lead.js";
import {
  triggerDograhOutboundCallByWorkflow,
  triggerDograhTestCallByWorkflow,
} from "../services/dograh.service.js";
import { generateAgentTextReply } from "../services/gemini.service.js";
import { generateSystemPrompt } from "../services/promptGenerator.js";

function userFilter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
}

async function getOwnedAgent(req) {
  const agent = await Agent.findOne({
    _id: req.params.id,
    ...userFilter(req),
  });

  if (!agent) throw new ApiError(404, "Agent not found");

  return agent;
}

function assertE164(value, fieldName) {
  if (!value || !/^\+[1-9]\d{7,14}$/.test(value)) {
    throw new ApiError(
      400,
      `${fieldName} must be in E.164 format, for example +17578297060`
    );
  }
}

function dograhCallPayload(agent, phoneNumber) {
  return {
    phone_number: phoneNumber,
    calling_number: agent.callerIdNumber,

    initial_context: {
      businessName: agent.businessName,
      agentName: agent.agentName,
      localAgentId: agent._id.toString(),
      userId: agent.userId.toString(),
    },

    metadata: {
      localAgentId: agent._id.toString(),
      userId: agent.userId.toString(),
      dograhWorkflowUuid: agent.dograhWorkflowUuid,
    },
  };
}

function extractRunId(response) {
  return (
    response?.run_id ||
    response?.runId ||
    response?.id ||
    response?.data?.run_id ||
    response?.data?.runId ||
    response?.run?.id
  );
}

export const createAgent = asyncHandler(async (req, res) => {
  if (!req.body.agentName || !req.body.agentType || !req.body.businessName) {
    throw new ApiError(400, "Agent name, type, and business name are required");
  }

  const agent = new Agent({ ...req.body, userId: req.user._id });
  agent.systemPrompt = generateSystemPrompt(agent);
  await agent.save();

  res.status(201).json(agent);
});

export const listAgents = asyncHandler(async (req, res) => {
  const agents = await Agent.find(userFilter(req)).sort({ createdAt: -1 });
  res.json(agents);
});

export const getAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  const [recentCalls, recentLeads] = await Promise.all([
    CallLog.find({ agentId: agent._id }).sort({ createdAt: -1 }).limit(5),
    Lead.find({ agentId: agent._id }).sort({ createdAt: -1 }).limit(5),
  ]);

  res.json({ agent, recentCalls, recentLeads });
});

export const updateAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  Object.assign(agent, req.body);
  agent.systemPrompt = generateSystemPrompt(agent);
  await agent.save();

  res.json(agent);
});

export const removeAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  await agent.deleteOne();

  res.json({ message: "Agent deleted" });
});

export const testAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);
  const { message } = req.body;

  if (!message || !message.trim()) {
    throw new ApiError(400, "Message is required.");
  }

  const aiResponse = await generateAgentTextReply({
    systemPrompt: agent.systemPrompt,
    message,
    agent,
  });

  res.json({
    success: true,
    message,
    response: aiResponse,
  });
});

export const publishAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  if (!agent.agentName || !agent.businessName || !agent.systemPrompt) {
    throw new ApiError(400, "Agent is missing required fields");
  }

  agent.status = "Active";
  agent.shareableLink = `${process.env.CLIENT_URL}/test/${agent._id}`;
  agent.embedCode = `<script src="${process.env.CLIENT_URL}/widget.js" data-agent-id="${agent._id}"></script>`;

  await agent.save();

  res.json(agent);
});

export const pauseAgent = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  agent.status = "Paused";
  await agent.save();

  res.json(agent);
});

export const connectDograhWorkflow = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  const {
    dograhWorkflowId,
    dograhWorkflowUuid,
    dograhWorkflowName,
    connectedPhoneNumber,
    callerIdNumber,
    telephonyProvider,
  } = req.body;

  if (!dograhWorkflowId || !dograhWorkflowUuid) {
    throw new ApiError(
      400,
      "Dograh workflow ID and workflow UUID are required"
    );
  }

  assertE164(connectedPhoneNumber, "Connected phone number");
  assertE164(callerIdNumber, "Caller ID number");

  agent.dograhWorkflowId = dograhWorkflowId;
  agent.dograhWorkflowUuid = dograhWorkflowUuid;
  agent.dograhWorkflowName = dograhWorkflowName;
  agent.connectedPhoneNumber = connectedPhoneNumber;
  agent.callerIdNumber = callerIdNumber;
  agent.telephonyProvider = telephonyProvider || "twilio";
  agent.dograhStatus = "connected";
  agent.status = "Connected";

  await agent.save();

  res.json(agent);
});

async function triggerCall(req, res, trigger) {
  if (!process.env.DOGRAH_BASE_URL) {
    throw new ApiError(
      500,
      "DOGRAH_BASE_URL is missing. Please configure the backend environment."
    );
  }

  if (!process.env.DOGRAH_API_KEY) {
    throw new ApiError(
      500,
      "DOGRAH_API_KEY is missing. Please configure the backend environment."
    );
  }

  const agent = await getOwnedAgent(req);
  const { phoneNumber } = req.body;

  if (!agent.dograhWorkflowUuid) {
    throw new ApiError(
      400,
      "workflowUuid is required. Connect a Dograh workflow before triggering calls."
    );
  }

  if (!phoneNumber) {
    throw new ApiError(
      400,
      "phoneNumber is required before triggering a Dograh call."
    );
  }

  if (!agent.callerIdNumber) {
    throw new ApiError(
      400,
      "callerIdNumber is required. Connect a Dograh workflow with a caller ID number."
    );
  }

  assertE164(phoneNumber, "Phone number");
  assertE164(agent.callerIdNumber, "Caller ID number");

  const payload = dograhCallPayload(agent, phoneNumber);
  const dograhResponse = await trigger(agent.dograhWorkflowUuid, payload);
  const dograhRunId = extractRunId(dograhResponse);

  const callLog = await CallLog.create({
    userId: req.user._id,
    agentId: agent._id,
    dograhWorkflowId: agent.dograhWorkflowId,
    dograhWorkflowUuid: agent.dograhWorkflowUuid,
    dograhRunId,
    callerNumber: phoneNumber,
    callingNumber: agent.callerIdNumber,
    status: "pending",
    rawDograhPayload: dograhResponse,
    startedAt: new Date(),
  });

  res.status(202).json({ dograhResponse, callLog });
}

export const triggerTestCall = asyncHandler(async (req, res) => {
  await triggerCall(req, res, triggerDograhTestCallByWorkflow);
});

export const triggerOutboundCall = asyncHandler(async (req, res) => {
  await triggerCall(req, res, triggerDograhOutboundCallByWorkflow);
});

export const listAgentCalls = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req);

  const calls = await CallLog.find({
    agentId: agent._id,
    userId: agent.userId,
  }).sort({ createdAt: -1 });

  res.json(calls);
});
