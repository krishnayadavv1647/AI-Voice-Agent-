import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Agent from "../models/Agent.js";
import WebCall from "../models/WebCall.js";
import { buildDograhWidgetConfig, endDograhWebCall } from "../services/dograhWebCall.service.js";

function userFilter(req) {
  return req.user.role === "admin" ? {} : { userId: req.user._id };
}

async function getOwnedAgent(req, agentId) {
  const agent = await Agent.findOne({
    _id: agentId,
    ...userFilter(req)
  });

  if (!agent) throw new ApiError(404, "Agent not found");
  return agent;
}

function getDograhWorkflowId(agent) {
  return agent.providerWorkflowId || agent.dograhWorkflowId || agent.workflowId;
}

function ensureDograhSynced(agent) {
  const workflowId = getDograhWorkflowId(agent);

  if (!workflowId) {
    throw new ApiError(
      400,
      "Dograh workflow ID missing. Sync this agent with Dograh before starting a web call."
    );
  }

  if (agent.provider !== "dograh" && !agent.providerWorkflowId && !agent.dograhWorkflowId) {
    throw new ApiError(400, "Agent not synced with Dograh");
  }

  return workflowId;
}

function normalizeTranscript(transcript) {
  if (!Array.isArray(transcript)) return [];

  return transcript
    .map((entry) => ({
      role: ["user", "assistant", "system"].includes(entry?.role) ? entry.role : "user",
      text: String(entry?.text || entry?.content || "").trim(),
      timestamp: entry?.timestamp ? new Date(entry.timestamp) : new Date()
    }))
    .filter((entry) => entry.text);
}

function pickFrontendSafeDograhFields(response = {}) {
  return {
    providerCallId: null,
    workflowId: response.workflowId || response.workflow_id || null,
    workflowUuid: response.workflowUuid || response.workflow_uuid || null,
    widgetConfig: response,
    embedConfig: response
  };
}

export const startDograhWebCallController = asyncHandler(async (req, res) => {
  const { agentId } = req.body;

  console.log("Dograh web call route hit");
  console.log("Dograh web call start request body:", req.body);
  console.log("agentId:", agentId);

  if (!agentId) {
    return res.status(422).json({
      success: false,
      message: "agentId is required to start Dograh web call"
    });
  }

  const agent = await getOwnedAgent(req, agentId);
  const workflowId = getDograhWorkflowId(agent);

  console.log("workflowId:", workflowId);

  if (!workflowId) {
    return res.status(422).json({
      success: false,
      message: "Dograh workflow ID missing. Sync this agent with Dograh before starting a web call."
    });
  }

  ensureDograhSynced(agent);
  const dograhResponse = buildDograhWidgetConfig({ workflowId, agent });
  const dograh = pickFrontendSafeDograhFields(dograhResponse);

  const webCall = await WebCall.create({
    userId: req.user._id,
    agentId: agent._id,
    provider: "dograh",
    providerCallId: dograh.providerCallId,
    status: "starting",
    startedAt: new Date(),
    metadata: {
      workflowId,
      providerCallId: dograh.providerCallId,
      dograhResponse
    }
  });

  res.status(201).json({
    success: true,
    message: "Dograh web call started",
    callId: webCall._id,
    provider: "dograh",
    dograh
  });
});

export const endDograhWebCallController = asyncHandler(async (req, res) => {
  const { callId, providerCallId, duration, transcript } = req.body;

  if (!callId) throw new ApiError(400, "callId is required");

  const webCall = await WebCall.findOne({
    _id: callId,
    ...userFilter(req)
  });

  if (!webCall) throw new ApiError(404, "Call log not found");

  const finalProviderCallId = providerCallId || webCall.providerCallId;
  let dograhEndResult = null;

  if (finalProviderCallId) {
    try {
      dograhEndResult = await endDograhWebCall({ providerCallId: finalProviderCallId });
    } catch (error) {
      if (error.statusCode !== 501) throw error;
      dograhEndResult = { skipped: true, message: error.message };
    }
  }

  webCall.status = "ended";
  webCall.endedAt = new Date();
  webCall.duration = Number.isFinite(Number(duration)) ? Math.max(0, Math.round(Number(duration))) : webCall.duration || 0;
  webCall.transcript = normalizeTranscript(transcript);
  webCall.providerCallId = finalProviderCallId || webCall.providerCallId;
  webCall.metadata = {
    ...webCall.metadata,
    dograhEndResult
  };
  await webCall.save();

  res.json({ success: true, webCall });
});

export const listDograhWebCallHistoryController = asyncHandler(async (req, res) => {
  const agent = await getOwnedAgent(req, req.params.agentId);
  const calls = await WebCall.find({
    agentId: agent._id,
    provider: "dograh",
    ...userFilter(req)
  }).sort({ createdAt: -1 });

  res.json(calls);
});
