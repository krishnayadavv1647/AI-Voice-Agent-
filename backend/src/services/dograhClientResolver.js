import axios from "axios";
import dns from "dns/promises";
import net from "net";
import UserIntegration from "../models/UserIntegration.js";
import { ApiError } from "../utils/apiError.js";
import { decryptSecret, maskSecret } from "../utils/crypto.js";

const DEFAULT_DOGRAH_BASE_URL = "https://app.dograh.com/api/v1";

function cleanBaseUrl(value) {
  return String(value || process.env.DOGRAH_BASE_URL || DEFAULT_DOGRAH_BASE_URL).trim().replace(/\/$/, "");
}

function globalFallbackAllowed(override) {
  if (override !== undefined) return Boolean(override);
  return process.env.DOGRAH_ALLOW_GLOBAL_FALLBACK === "true";
}

function safeDograhError(error, fallback = "Dograh connection failed.") {
  const status = error?.response?.status || error?.statusCode;
  if (status === 401 || status === 403) return "Dograh rejected the configured API key.";
  if (status === 404) return "Dograh endpoint was not found at the configured base URL.";
  if (status === 429) return "Dograh rate limit reached. Please try again later.";
  if (error?.code === "ENOTFOUND") return "Dograh base URL could not be reached.";
  if (error?.code === "ECONNABORTED") return "Dograh request timed out.";
  return error?.safeMessage || error?.message || fallback;
}

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    return (
      parts[0] === 0 ||
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    );
  }
  const lower = String(address || "").toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
}

function privateHostsAllowedFor(hostname) {
  return String(process.env.DOGRAH_SELF_HOSTED_ALLOWLIST || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(String(hostname || "").toLowerCase());
}

export function assertSafeDograhBaseUrl(baseUrl, { allowPrivate = false, allowHttp = false } = {}) {
  let parsed;
  try {
    parsed = new URL(cleanBaseUrl(baseUrl));
  } catch {
    throw new ApiError(400, "Unsafe Dograh base URL.", { code: "DOGRAH_UNSAFE_BASE_URL" });
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new ApiError(400, "Unsafe Dograh base URL.", { code: "DOGRAH_UNSAFE_BASE_URL" });
  }
  if (parsed.protocol === "http:" && !allowHttp && process.env.NODE_ENV === "production") {
    throw new ApiError(400, "Unsafe Dograh base URL.", { code: "DOGRAH_UNSAFE_BASE_URL" });
  }

  const hostname = parsed.hostname.toLowerCase();
  const privateAllowed = allowPrivate || privateHostsAllowedFor(hostname);
  if (["localhost", "metadata.google.internal"].includes(hostname) || hostname.endsWith(".localhost")) {
    throw new ApiError(400, "Unsafe Dograh base URL.", { code: "DOGRAH_UNSAFE_BASE_URL" });
  }
  if (net.isIP(hostname) && isPrivateIp(hostname) && !privateAllowed) {
    throw new ApiError(400, "Unsafe Dograh base URL.", { code: "DOGRAH_UNSAFE_BASE_URL" });
  }
  return parsed.toString().replace(/\/$/, "");
}

export async function assertResolvedDograhHostSafe(baseUrl, options = {}) {
  const safeUrl = assertSafeDograhBaseUrl(baseUrl, options);
  const parsed = new URL(safeUrl);
  const privateAllowed = options.allowPrivate || privateHostsAllowedFor(parsed.hostname);
  const records = await dns.lookup(parsed.hostname, { all: true });
  if (!privateAllowed && records.some((record) => isPrivateIp(record.address))) {
    throw new ApiError(400, "Unsafe Dograh base URL.", { code: "DOGRAH_UNSAFE_BASE_URL" });
  }
  return safeUrl;
}

export function createDograhClientFromCredentials({ apiKey, baseUrl }) {
  const cleanApiKey = String(apiKey || "").trim();
  const cleanUrl = assertSafeDograhBaseUrl(baseUrl);

  if (!cleanUrl) throw new ApiError(500, "DOGRAH_BASE_URL is missing. Please configure Dograh base URL.");
  if (!cleanApiKey) throw new ApiError(500, "Dograh API key is missing. Connect Dograh in Settings or configure the platform key.");

  return axios.create({
    baseURL: cleanUrl,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": cleanApiKey
    },
    timeout: 30000,
    maxContentLength: 2 * 1024 * 1024,
    maxBodyLength: 2 * 1024 * 1024,
    maxRedirects: 3,
    beforeRedirect: (options) => {
      const nextUrl = `${options.protocol}//${options.hostname}${options.path || ""}`;
      assertSafeDograhBaseUrl(nextUrl);
    }
  });
}

function globalDograhConfig() {
  return {
    mode: "platform",
    baseUrl: cleanBaseUrl(process.env.DOGRAH_BASE_URL),
    apiKey: process.env.DOGRAH_API_KEY?.trim() || ""
  };
}

export function getPlatformDograhClient() {
  const global = globalDograhConfig();
  return {
    client: createDograhClientFromCredentials(global),
    mode: "platform",
    dograhConnectionType: "platform",
    dograhIntegrationId: null,
    baseUrl: global.baseUrl,
    maskedApiKey: maskSecret(global.apiKey),
    apiKeyExists: Boolean(global.apiKey),
    apiKeyPrefix: null
  };
}

export async function getDograhClientForIntegration(integrationId, userId) {
  if (!integrationId) {
    throw new ApiError(400, "Dograh agent binding is missing.", { code: "DOGRAH_AGENT_BINDING_MISSING" });
  }
  const integration = await UserIntegration.findOne({ _id: integrationId, userId, provider: "dograh" });
  if (!integration || integration.status !== "connected" || !integration.apiKeyEncrypted) {
    throw new ApiError(400, "Dograh integration is not connected.", { code: "DOGRAH_INTEGRATION_INVALID" });
  }

  try {
    const apiKey = decryptSecret(integration.apiKeyEncrypted);
    const baseUrl = cleanBaseUrl(integration.baseUrl);
    return {
      client: createDograhClientFromCredentials({ apiKey, baseUrl }),
      mode: "user_integration",
      dograhConnectionType: "user_integration",
      dograhIntegrationId: integration._id,
      baseUrl,
      maskedApiKey: maskSecret(apiKey),
      apiKeyExists: Boolean(apiKey),
      apiKeyPrefix: null,
      integration
    };
  } catch (error) {
    integration.status = "invalid";
    integration.lastError = safeDograhError(error);
    integration.lastErrorSafeMessage = integration.lastError;
    integration.lastTestedAt = new Date();
    await integration.save();
    throw new ApiError(400, "Dograh integration is invalid.", { code: "DOGRAH_INTEGRATION_INVALID" });
  }
}

export async function getDograhClientForAgent(agent, userId) {
  if (agent?.dograhConnectionType === "platform") return getPlatformDograhClient();
  if (agent?.dograhConnectionType === "user_integration" && agent?.dograhIntegrationId) {
    return getDograhClientForIntegration(agent.dograhIntegrationId, userId || agent.userId);
  }

  const integration = userId || agent?.userId
    ? await UserIntegration.findOne({ userId: userId || agent.userId, provider: "dograh", status: "connected" })
    : null;
  if (integration && agent?.dograhWorkflowId) {
    return getDograhClientForIntegration(integration._id, userId || agent.userId);
  }
  return getPlatformDograhClient();
}

export async function getDefaultDograhClientForNewAgent(userId, options = {}) {
  const preferredType = options.connectionType || options.dograhConnectionType;
  if (preferredType === "platform") return getPlatformDograhClient();
  if (preferredType === "user_integration" && options.integrationId) {
    return getDograhClientForIntegration(options.integrationId, userId);
  }

  const integration = await UserIntegration.findOne({ userId, provider: "dograh", status: "connected" });
  if (integration) return getDograhClientForIntegration(integration._id, userId);
  return getPlatformDograhClient();
}

export async function getDograhClientForUser(userId, { allowGlobalFallbackOnError } = {}) {
  const allowFallback = globalFallbackAllowed(allowGlobalFallbackOnError);
  const integration = userId
    ? await UserIntegration.findOne({ userId, provider: "dograh", status: "connected" })
    : null;

  if (integration?.apiKeyEncrypted) {
    try {
      const apiKey = decryptSecret(integration.apiKeyEncrypted);
      const baseUrl = cleanBaseUrl(integration.baseUrl);
      const client = createDograhClientFromCredentials({ apiKey, baseUrl });
      client.interceptors.response.use(
        (response) => response,
        async (error) => {
          if (!allowFallback || error.config?.__dograhFallbackAttempted) return Promise.reject(error);

          const global = globalDograhConfig();
          if (!global.apiKey) return Promise.reject(error);

          integration.status = "failed";
          integration.lastError = safeDograhError(error);
          integration.lastErrorSafeMessage = integration.lastError;
          integration.lastTestedAt = new Date();
          await integration.save();

          console.warn("[Dograh] user API request failed, retrying with platform fallback", {
            userId: String(userId),
            status: error.response?.status,
            error: integration.lastError
          });

          const fallbackClient = createDograhClientFromCredentials(global);
          return fallbackClient.request({
            ...error.config,
            __dograhFallbackAttempted: true,
            baseURL: global.baseUrl,
            headers: {
              ...(error.config?.headers || {}),
              "Content-Type": "application/json",
              "X-API-Key": global.apiKey
            }
          });
        }
      );

      return {
        client,
        mode: "user_integration",
        dograhConnectionType: "user_integration",
        dograhIntegrationId: integration._id,
        baseUrl,
        maskedApiKey: maskSecret(apiKey),
        apiKeyExists: Boolean(apiKey),
        apiKeyPrefix: null,
        integration
      };
    } catch (error) {
      integration.status = "failed";
      integration.lastError = safeDograhError(error);
      integration.lastErrorSafeMessage = integration.lastError;
      integration.lastTestedAt = new Date();
      await integration.save();

      if (!allowFallback) {
        throw new ApiError(502, "Your Dograh API connection failed. Please update your Dograh API key in Dograh Settings.", {
          dograhIntegrationError: integration.lastError
        });
      }

      console.warn("[Dograh] user credential failed, using platform fallback", {
        userId: String(userId),
        error: integration.lastError
      });
    }
  }

  return getPlatformDograhClient();
}

export async function testDograhConnection({ apiKey, baseUrl, userId } = {}) {
  const safeBaseUrl = await assertResolvedDograhHostSafe(baseUrl || process.env.DOGRAH_BASE_URL || DEFAULT_DOGRAH_BASE_URL);
  const resolved = apiKey
    ? {
        client: createDograhClientFromCredentials({ apiKey, baseUrl: safeBaseUrl }),
        mode: "provided",
        baseUrl: safeBaseUrl,
        maskedApiKey: maskSecret(apiKey)
      }
    : await getDograhClientForUser(userId);

  const response = await resolved.client.get("/workflow/fetch", {
    params: {
      archived: false,
      isArchived: false,
      status: "active"
    }
  });

  const account =
    response.data?.account ||
    response.data?.organization ||
    response.data?.user ||
    response.data?.data?.account ||
    {};

  return {
    success: true,
    mode: resolved.mode,
    baseUrl: resolved.baseUrl,
    maskedApiKey: resolved.maskedApiKey,
    accountEmail: account.email || account.accountEmail || "",
    workspaceId: account.workspaceId || account.workspace_id || account.id || "",
    apiVersion: response.headers?.["x-dograh-api-version"] || response.data?.apiVersion || response.data?.version || "",
    capabilities: {
      baseUrlReachable: true,
      apiKeyValid: true,
      workflowRead: true,
      createWorkflow: "not_tested",
      updateWorkflow: "not_tested",
      callingSupport: "not_tested",
      telephonySupport: "not_tested"
    }
  };
}
