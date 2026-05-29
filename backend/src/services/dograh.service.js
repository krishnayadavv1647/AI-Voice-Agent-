import axios from "axios";
import { ApiError } from "../utils/apiError.js";
import { buildDograhWorkflowDefinition, validateLocalWorkflowDefinition } from "./dograhWorkflowBuilder.js";

const EXPECTED_DOGRAH_BASE_URL = "https://app.dograh.com/api/v1";
const DOGRAH_CREATE_FROM_DEFINITION_ENDPOINT = "/workflow/create/definition";
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function getDograhBaseUrl() {
  return process.env.DOGRAH_BASE_URL?.trim().replace(/\/$/, "");
}

function getDograhApiKey() {
  return process.env.DOGRAH_API_KEY?.trim();
}

function requireDograhConfig() {
  if (!getDograhBaseUrl()) {
    throw new ApiError(
      500,
      "DOGRAH_BASE_URL is missing. Please configure the backend environment."
    );
  }

  if (!getDograhApiKey()) {
    throw new ApiError(
      500,
      "DOGRAH_API_KEY is missing. Please configure the backend environment."
    );
  }
}

function maskKey(value) {
  if (!value) return "<missing>";
  return `${value.slice(0, 6)}...`;
}

function validateWorkflowCall(workflowUuid, payload) {
  requireDograhConfig();

  const baseUrl = getDograhBaseUrl();

  if (baseUrl !== EXPECTED_DOGRAH_BASE_URL) {
    throw new ApiError(
      500,
      `DOGRAH_BASE_URL must be ${EXPECTED_DOGRAH_BASE_URL}`
    );
  }

  if (!workflowUuid) {
    throw new ApiError(400, "workflowUuid is required before calling Dograh.");
  }

  if (!payload?.phone_number) {
    throw new ApiError(400, "phoneNumber is required before calling Dograh.");
  }

  if (!payload?.calling_number) {
    throw new ApiError(
      400,
      "callerIdNumber is required before calling Dograh."
    );
  }

  if (!E164_PATTERN.test(payload.phone_number)) {
    throw new ApiError(
      400,
      "phoneNumber must be in E.164 format, for example +918002816147"
    );
  }

  if (!E164_PATTERN.test(payload.calling_number)) {
    throw new ApiError(
      400,
      "callerIdNumber must be in E.164 format, for example +17578297060"
    );
  }
}

function logDograhCall({ endpoint, workflowUuid, payload }) {
  const baseUrl = getDograhBaseUrl();
  const apiKey = getDograhApiKey();

  console.log("Dograh endpoint:", endpoint);
  console.log("workflowUuid:", workflowUuid);
  console.log("phoneNumber:", payload?.phone_number);
  console.log("callerIdNumber:", payload?.calling_number);
  console.log("baseURL:", baseUrl);
  console.log("Dograh API call diagnostics:", {
    dograhBaseUrlExists: Boolean(baseUrl),
    dograhBaseUrl: baseUrl,
    dograhApiKeyExists: Boolean(apiKey),
    dograhApiKeyPrefix: maskKey(apiKey),
    workflowUuid,
    phone_number: payload?.phone_number,
    calling_number: payload?.calling_number,
    endpoint: `${baseUrl}${endpoint}`,
  });
}

export function getDograhDebugInfo() {
  const baseUrl = getDograhBaseUrl();
  const apiKey = getDograhApiKey();

  return {
    dograhBaseUrlExists: Boolean(baseUrl),
    dograhBaseUrl: baseUrl,
    dograhApiKeyExists: Boolean(apiKey),
    dograhApiKeyPreview: apiKey ? maskKey(apiKey) : "MISSING",
  };
}

function createDograhClient() {
  requireDograhConfig();

  console.log("DOGRAH_BASE_URL:", getDograhBaseUrl());
  console.log("DOGRAH_API_KEY:", getDograhApiKey() ? maskKey(getDograhApiKey()) : "MISSING");

  return axios.create({
    baseURL: getDograhBaseUrl(),
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": getDograhApiKey(),
    },
    timeout: 30000,
  });
}

function handleDograhError(error, action) {
  console.error("Dograh API Error Status:", error.response?.status);
  console.error("Dograh API Error Data:", error.response?.data);
  console.error("Dograh API Error Message:", error.message);

  const statusCode = error.response?.status || 502;

  const realMessage =
    error.response?.data?.message ||
    error.response?.data?.error ||
    error.response?.data?.detail ||
    (error.response?.data ? JSON.stringify(error.response.data) : null) ||
    error.message ||
    "Dograh API call failed";

  throw new ApiError(statusCode, realMessage, {
    success: false,
    dograhStatus: error.response?.status,
    dograhError: error.response?.data,
  });
}

export async function fetchDograhWorkflows() {
  try {
    console.log("Fetching Dograh workflows...");

    const response = await createDograhClient().get("/workflow/fetch");

    return response.data;
  } catch (error) {
    handleDograhError(error, "fetch workflows");
  }
}

export function extractDograhWorkflowFields(dograhResponse) {
  const workflow =
    dograhResponse?.workflow ||
    dograhResponse?.data?.workflow ||
    dograhResponse?.data?.workflow_data ||
    dograhResponse?.workflow_data ||
    dograhResponse?.data ||
    {};

  return {
    dograhWorkflowId:
      dograhResponse?.id ||
      dograhResponse?.workflow_id ||
      dograhResponse?.workflowId ||
      dograhResponse?.workflowID ||
      dograhResponse?.data?.id ||
      dograhResponse?.data?.workflow_id ||
      dograhResponse?.data?.workflowId ||
      dograhResponse?.data?.workflowID ||
      workflow?.id ||
      workflow?.workflow_id ||
      workflow?.workflowId ||
      workflow?.workflowID ||
      null,

    dograhWorkflowUuid:
      dograhResponse?.workflow_uuid ||
      dograhResponse?.uuid ||
      dograhResponse?.workflowUuid ||
      dograhResponse?.workflowUUID ||
      dograhResponse?.workflow?.uuid ||
      dograhResponse?.workflow?.workflow_uuid ||
      dograhResponse?.workflow?.workflowUuid ||
      dograhResponse?.workflow?.workflowUUID ||
      dograhResponse?.data?.workflow_uuid ||
      dograhResponse?.data?.uuid ||
      dograhResponse?.data?.workflowUuid ||
      dograhResponse?.data?.workflowUUID ||
      workflow?.workflow_uuid ||
      workflow?.uuid ||
      workflow?.workflowUuid ||
      workflow?.workflowUUID ||
      null,

    dograhWorkflowName:
      dograhResponse?.name ||
      dograhResponse?.workflow_name ||
      dograhResponse?.workflowName ||
      dograhResponse?.data?.name ||
      dograhResponse?.data?.workflow_name ||
      dograhResponse?.data?.workflowName ||
      workflow?.name ||
      workflow?.workflow_name ||
      workflow?.workflowName ||
      null
  };
}

export async function resolveDograhWorkflowFields(dograhResponse) {
  const fields = extractDograhWorkflowFields(dograhResponse);

  if (fields.dograhWorkflowUuid || !fields.dograhWorkflowId) {
    return fields;
  }

  try {
    console.log("Dograh workflow UUID missing in create response. Fetching workflow by ID:", fields.dograhWorkflowId);
    const workflowResponse = await getDograhWorkflow(fields.dograhWorkflowId);
    const fetchedFields = extractDograhWorkflowFields(workflowResponse);

    return {
      dograhWorkflowId: fields.dograhWorkflowId || fetchedFields.dograhWorkflowId,
      dograhWorkflowUuid: fetchedFields.dograhWorkflowUuid || fields.dograhWorkflowUuid,
      dograhWorkflowName: fields.dograhWorkflowName || fetchedFields.dograhWorkflowName
    };
  } catch (error) {
    console.error("Dograh workflow UUID fetch failed:", error.message);
    return fields;
  }
}

export async function createDograhWorkflowFromDefinition(agent) {
  try {
    const workflow_definition = buildDograhWorkflowDefinition(agent);

    validateLocalWorkflowDefinition(workflow_definition);

    const payload = {
      name: agent.agentName || `${agent.businessName} Agent`,
      workflow_definition
    };

    console.log("Creating Dograh workflow from definition:", {
      endpoint: DOGRAH_CREATE_FROM_DEFINITION_ENDPOINT,
      name: payload.name,
      nodeCount: workflow_definition.nodes.length,
      edgeCount: workflow_definition.edges.length
    });

    const response = await createDograhClient().post(
      DOGRAH_CREATE_FROM_DEFINITION_ENDPOINT,
      payload
    );

    return response.data;
  } catch (error) {
    console.error("Dograh create workflow failed status:", error.response?.status);
    console.error("Dograh create workflow failed data:", error.response?.data);
    console.error("Dograh create workflow failed message:", error.message);

    if (error instanceof ApiError) throw error;

    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.detail ||
      (error.response?.data ? JSON.stringify(error.response.data) : null) ||
      error.message ||
      "Dograh workflow creation failed";

    throw new ApiError(error.response?.status || 502, message);
  }
}

export async function getDograhWorkflow(workflowId) {
  try {
    if (!workflowId) {
      throw new ApiError(400, "workflowId is required");
    }

    const response = await createDograhClient().get(
      `/workflow/fetch/${workflowId}`
    );

    return response.data;
  } catch (error) {
    handleDograhError(error, "get workflow");
  }
}

export async function triggerDograhTestCallByWorkflow(workflowUuid, payload) {
  const endpoint = `/public/agent/test/workflow/${workflowUuid}`;

  validateWorkflowCall(workflowUuid, payload);
  logDograhCall({ endpoint, workflowUuid, payload });

  try {
    const response = await createDograhClient().post(endpoint, payload);

    return response.data;
  } catch (error) {
    handleDograhError(error, "trigger test call");
  }
}

export async function triggerDograhOutboundCallByWorkflow(workflowUuid, payload) {
  const endpoint = `/public/agent/workflow/${workflowUuid}`;

  validateWorkflowCall(workflowUuid, payload);
  logDograhCall({ endpoint, workflowUuid, payload });

  try {
    const response = await createDograhClient().post(endpoint, payload);

    return response.data;
  } catch (error) {
    handleDograhError(error, "trigger outbound call");
  }
}

export async function getDograhCallRunDetails(workflowId, runId) {
  try {
    if (!workflowId || !runId) {
      throw new ApiError(400, "workflowId and runId are required");
    }

    const response = await createDograhClient().get(
      `/workflow/${workflowId}/runs/${runId}`
    );

    return response.data;
  } catch (error) {
    handleDograhError(error, "get call run details");
  }
}

export async function downloadDograhArtifact(token, artifactType) {
  try {
    if (!token || !artifactType) {
      throw new ApiError(400, "token and artifactType are required");
    }

    const response = await createDograhClient().get(
      `/public/download/workflow/${token}/${artifactType}`
    );

    return response.data;
  } catch (error) {
    handleDograhError(error, "download artifact");
  }
}
