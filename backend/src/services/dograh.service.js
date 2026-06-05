import axios from "axios";
import { ApiError } from "../utils/apiError.js";
import { buildDograhWorkflowDefinition, validateLocalWorkflowDefinition } from "./dograhWorkflowBuilder.js";

const EXPECTED_DOGRAH_BASE_URL = "https://app.dograh.com/api/v1";
const DOGRAH_CREATE_FROM_DEFINITION_ENDPOINT = "/workflow/create/definition";
const DOGRAH_TELEPHONY_CONFIGS_ENDPOINT = "/organizations/telephony-configs";
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

function formatDograhErrorMessage(data, fallback) {
  const detail = data?.message || data?.error || data?.detail;

  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return JSON.stringify(detail);
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  if (data) return JSON.stringify(data);

  return fallback;
}

function friendlyDograhErrorMessage(data, fallback) {
  const rawMessage = formatDograhErrorMessage(data, fallback);

  if (/telephony provider not configured/i.test(rawMessage)) {
    return "Dograh workflow could not be created because telephony provider is not configured in your Dograh organization. Configure a caller/telephony provider in Dograh, then retry Dograh workflow sync.";
  }

  return rawMessage;
}

function handleDograhError(error, action) {
  console.error("Dograh API Error Status:", error.response?.status);
  console.error("Dograh API Error Data:", error.response?.data);
  console.error("Dograh API Error Message:", error.message);

  const statusCode = error.response?.status || 502;

  const realMessage = friendlyDograhErrorMessage(
    error.response?.data,
    error.message || "Dograh API call failed"
  );

  throw new ApiError(statusCode, realMessage, {
    success: false,
    dograhStatus: error.response?.status,
    dograhError: error.response?.data,
    dograhAction: action,
    userMessage: realMessage
  });
}

function readDograhWorkflowList(responseData) {
  if (Array.isArray(responseData)) return responseData;
  if (Array.isArray(responseData?.data)) return responseData.data;
  if (Array.isArray(responseData?.workflows)) return responseData.workflows;
  if (Array.isArray(responseData?.results)) return responseData.results;
  return [];
}

function readDograhEmbedToken(responseData) {
  return (
    responseData?.embedToken ||
    responseData?.embed_token ||
    responseData?.token ||
    responseData?.data?.embedToken ||
    responseData?.data?.embed_token ||
    responseData?.data?.token ||
    null
  );
}

export function isActiveDograhWorkflow(workflow) {
  const status = String(workflow?.status || workflow?.workflow_status || workflow?.state || "").toLowerCase();
  const isArchived =
    workflow?.archived === true ||
    workflow?.isArchived === true ||
    workflow?.is_archived === true ||
    workflow?.deleted === true ||
    workflow?.isDeleted === true ||
    workflow?.is_deleted === true ||
    status === "archived" ||
    status === "inactive" ||
    status === "deleted";

  return !isArchived;
}

function applyActiveWorkflowFilter(responseData) {
  const workflows = readDograhWorkflowList(responseData);
  const activeWorkflows = workflows.filter(isActiveDograhWorkflow);

  console.log("Total Dograh workflows:", workflows.length);
  console.log("Active Dograh workflows:", activeWorkflows.length);

  if (Array.isArray(responseData)) return activeWorkflows;
  if (Array.isArray(responseData?.data)) return { ...responseData, data: activeWorkflows };
  if (Array.isArray(responseData?.workflows)) return { ...responseData, workflows: activeWorkflows };
  if (Array.isArray(responseData?.results)) return { ...responseData, results: activeWorkflows };

  return activeWorkflows;
}

export async function fetchDograhWorkflows() {
  try {
    console.log("Fetching Dograh workflows...");

    const response = await createDograhClient().get("/workflow/fetch", {
      params: {
        archived: false,
        isArchived: false,
        status: "active"
      }
    });

    return applyActiveWorkflowFilter(response.data);
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

    const message = friendlyDograhErrorMessage(
      error.response?.data,
      error.message || "Dograh workflow creation failed"
    );

    throw new ApiError(error.response?.status || 502, message, {
      success: false,
      dograhStatus: error.response?.status,
      dograhError: error.response?.data,
      dograhAction: "create workflow",
      userMessage: message
    });
  }
}

function extractDograhTelephonyConfigId(responseData = {}) {
  return (
    responseData.id ||
    responseData.config_id ||
    responseData.configuration_id ||
    responseData.telephony_configuration_id ||
    responseData.data?.id ||
    responseData.data?.config_id ||
    responseData.data?.configuration_id ||
    responseData.data?.telephony_configuration_id ||
    responseData.configuration?.id ||
    null
  );
}

function extractDograhPhoneNumberId(responseData = {}) {
  return (
    responseData.id ||
    responseData.phone_number_id ||
    responseData.data?.id ||
    responseData.data?.phone_number_id ||
    null
  );
}

export async function createDograhTelephonyConfiguration(payload) {
  try {
    const response = await createDograhClient().post(DOGRAH_TELEPHONY_CONFIGS_ENDPOINT, payload);
    const dograhTelephonyConfigId = extractDograhTelephonyConfigId(response.data);

    if (!dograhTelephonyConfigId) {
      throw new ApiError(502, "Dograh telephony configuration was created but no configuration ID was returned.", {
        dograhResponse: response.data
      });
    }

    return {
      dograhTelephonyConfigId,
      raw: response.data
    };
  } catch (error) {
    console.error("Dograh create telephony config failed status:", error.response?.status);
    console.error("Dograh create telephony config failed data:", error.response?.data);
    console.error("Dograh create telephony config failed message:", error.message);

    if (error instanceof ApiError) throw error;

    const message = friendlyDograhErrorMessage(
      error.response?.data,
      error.message || "Dograh telephony configuration creation failed"
    );

    throw new ApiError(error.response?.status || 502, message, {
      success: false,
      dograhStatus: error.response?.status,
      dograhError: error.response?.data,
      dograhAction: "create telephony configuration",
      userMessage: message
    });
  }
}

export async function addDograhTelephonyPhoneNumber(configId, payload) {
  try {
    const response = await createDograhClient().post(
      `${DOGRAH_TELEPHONY_CONFIGS_ENDPOINT}/${configId}/phone-numbers`,
      payload
    );

    return {
      dograhPhoneNumberId: extractDograhPhoneNumberId(response.data),
      providerSync: response.data?.provider_sync || null,
      raw: response.data
    };
  } catch (error) {
    console.error("Dograh add telephony phone number failed status:", error.response?.status);
    console.error("Dograh add telephony phone number failed data:", error.response?.data);
    console.error("Dograh add telephony phone number failed message:", error.message);

    if (error instanceof ApiError) throw error;

    const message = friendlyDograhErrorMessage(
      error.response?.data,
      error.message || "Dograh phone number attachment failed"
    );

    throw new ApiError(error.response?.status || 502, message, {
      success: false,
      dograhStatus: error.response?.status,
      dograhError: error.response?.data,
      dograhAction: "add telephony phone number",
      userMessage: message
    });
  }
}

export async function updateDograhWorkflowById(workflowId, agent) {
  try {
    if (!workflowId) {
      throw new ApiError(400, "dograhWorkflowId is required to update the existing Dograh workflow.");
    }

    const workflow_definition = buildDograhWorkflowDefinition(agent);
    validateLocalWorkflowDefinition(workflow_definition);

    const payload = {
      name: agent.agentName || `${agent.businessName} Agent`,
      workflow_definition
    };

    console.log("Updating existing Dograh workflow:", {
      dograhApiMethod: "PUT",
      dograhApiUrl: `${getDograhBaseUrl()}/workflow/${workflowId}`,
      endpoint: `/workflow/${workflowId}`,
      workflowId,
      name: payload.name,
      nodeCount: workflow_definition.nodes.length,
      edgeCount: workflow_definition.edges.length
    });

    const response = await createDograhClient().put(`/workflow/${workflowId}`, payload);

    return response.data;
  } catch (error) {
    console.error("Dograh update workflow failed status:", error.response?.status);
    console.error("Dograh update workflow failed data:", error.response?.data);
    console.error("Dograh update workflow failed message:", error.message);

    if (error instanceof ApiError) throw error;

    const message = friendlyDograhErrorMessage(
      error.response?.data,
      error.message || "Dograh workflow update failed"
    );

    throw new ApiError(error.response?.status || 502, message, {
      success: false,
      dograhStatus: error.response?.status,
      dograhError: error.response?.data,
      dograhAction: "update workflow",
      userMessage: message
    });
  }
}

export async function archiveDograhWorkflowById(workflowId) {
  try {
    if (!workflowId) {
      throw new ApiError(400, "dograhWorkflowId is required to archive the existing Dograh workflow.");
    }

    requireDograhConfig();

    const endpoint = `/workflow/${workflowId}/status`;

    console.log("Archiving Dograh workflow:", {
      workflowId,
      dograhArchiveUrl: `${getDograhBaseUrl()}${endpoint}`,
      dograhApiMethod: "PUT"
    });

    const response = await createDograhClient().put(endpoint, {
      status: "archived"
    });

    console.log("Dograh workflow archive response:", response.data || { status: response.status });

    return response.data || { success: true };
  } catch (error) {
    console.error("Dograh archive workflow failed status:", error.response?.status);
    console.error("Dograh archive workflow failed data:", error.response?.data);
    console.error("Dograh archive workflow failed message:", error.message);

    if (error instanceof ApiError) throw error;

    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.response?.data?.detail ||
      (error.response?.data ? JSON.stringify(error.response.data) : null) ||
      error.message ||
      "Dograh workflow archive failed";

    throw new ApiError(error.response?.status || 502, `Dograh workflow archive failed: ${message}`);
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

export async function createDograhEmbedToken(workflowId) {
  try {
    if (!workflowId) {
      throw new ApiError(400, "dograhWorkflowId is required before enabling Dograh web calling.");
    }

    const response = await createDograhClient().post(`/workflow/${workflowId}/embed-token`, {});
    const embedToken = readDograhEmbedToken(response.data);

    if (!embedToken) {
      throw new ApiError(502, "Dograh embed token was not returned.");
    }

    return { embedToken, raw: response.data };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    handleDograhError(error, "create embed token");
  }
}

export async function fetchDograhEmbedToken(workflowId) {
  try {
    if (!workflowId) {
      throw new ApiError(400, "dograhWorkflowId is required before reading Dograh web calling token.");
    }

    const response = await createDograhClient().get(`/workflow/${workflowId}/embed-token`);
    const embedToken = readDograhEmbedToken(response.data);

    return { embedToken, raw: response.data };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    handleDograhError(error, "get embed token");
  }
}

export async function deleteDograhEmbedToken(workflowId) {
  try {
    if (!workflowId) {
      throw new ApiError(400, "dograhWorkflowId is required before disabling Dograh web calling.");
    }

    const response = await createDograhClient().delete(`/workflow/${workflowId}/embed-token`);

    return response.data || { success: true };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    handleDograhError(error, "delete embed token");
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
