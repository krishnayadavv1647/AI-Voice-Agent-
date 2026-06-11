import axios from "axios";
import UserIntegration from "../models/UserIntegration.js";
import { ApiError } from "../utils/apiError.js";
import { decryptSecret, maskSecret } from "../utils/crypto.js";

const DEFAULT_DOGRAH_BASE_URL = "https://app.dograh.com/api/v1";

function cleanBaseUrl(value) {
  return String(value || process.env.DOGRAH_BASE_URL || DEFAULT_DOGRAH_BASE_URL).trim().replace(/\/$/, "");
}

function globalFallbackAllowed(override) {
  if (override !== undefined) return Boolean(override);
  return process.env.DOGRAH_ALLOW_GLOBAL_FALLBACK !== "false";
}

export function createDograhClientFromCredentials({ apiKey, baseUrl }) {
  const cleanApiKey = String(apiKey || "").trim();
  const cleanUrl = cleanBaseUrl(baseUrl);

  if (!cleanUrl) throw new ApiError(500, "DOGRAH_BASE_URL is missing. Please configure Dograh base URL.");
  if (!cleanApiKey) throw new ApiError(500, "Dograh API key is missing. Connect Dograh in Settings or configure the platform key.");

  return axios.create({
    baseURL: cleanUrl,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": cleanApiKey
    },
    timeout: 30000
  });
}

function globalDograhConfig() {
  return {
    mode: "platform",
    baseUrl: cleanBaseUrl(process.env.DOGRAH_BASE_URL),
    apiKey: process.env.DOGRAH_API_KEY?.trim() || ""
  };
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
          if (!allowFallback || error.config?.__dograhFallbackAttempted) {
            return Promise.reject(error);
          }

          const global = globalDograhConfig();
          if (!global.apiKey) return Promise.reject(error);

          integration.status = "failed";
          integration.lastError = error.response?.data?.message || error.response?.data?.error || error.message;
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
        mode: "user",
        baseUrl,
        maskedApiKey: maskSecret(apiKey),
        integration
      };
    } catch (error) {
      integration.status = "failed";
      integration.lastError = error.message;
      integration.lastTestedAt = new Date();
      await integration.save();

      if (!allowFallback) {
        throw new ApiError(502, "Your Dograh API connection failed. Please update your Dograh API key in Settings.", {
          dograhIntegrationError: error.message
        });
      }

      console.warn("[Dograh] user credential failed, using platform fallback", {
        userId: String(userId),
        error: error.message
      });
    }
  }

  const global = globalDograhConfig();
  return {
    client: createDograhClientFromCredentials(global),
    mode: "platform",
    baseUrl: global.baseUrl,
    maskedApiKey: maskSecret(global.apiKey)
  };
}

export async function testDograhConnection({ apiKey, baseUrl, userId } = {}) {
  const resolved = apiKey
    ? {
        client: createDograhClientFromCredentials({ apiKey, baseUrl }),
        mode: "provided",
        baseUrl: cleanBaseUrl(baseUrl),
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
    raw: response.data
  };
}
