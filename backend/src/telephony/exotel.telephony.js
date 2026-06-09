import axios from "axios";
import { ApiError } from "../utils/apiError.js";
import { decryptSecret } from "../utils/secretCrypto.js";

function subdomain(config) {
  return config.region || process.env.EXOTEL_SUBDOMAIN || "api.exotel.com";
}

function accountSid(config) {
  return config.accountSid || config.apiKey;
}

function auth(config) {
  return {
    username: config.apiKey || config.accountSid,
    password: decryptSecret(config.apiSecret || config.authToken)
  };
}

function baseUrl(config) {
  return `https://${subdomain(config)}/v1/Accounts/${accountSid(config)}`;
}

export const ExotelTelephony = {
  saveConfig(config) {
    if (!accountSid(config) || !(config.apiKey || config.authToken) || !(config.apiSecret || config.authToken)) {
      throw new ApiError(400, "Exotel Account SID, API Key, and API Token are required");
    }
    return config;
  },

  async testConnection(config) {
    const response = await axios.get(`${baseUrl(config)}/Calls.json`, {
      auth: auth(config),
      params: { PageSize: 1 }
    });

    return {
      provider: "exotel",
      status: "connected",
      message: "Exotel credentials verified.",
      count: response.data?.Total || response.data?.total
    };
  },

  async configureWebhook(config) {
    if (!config.webhookUrl) throw new ApiError(400, "Webhook URL is required before configuring Exotel");
    if (!config.appId) {
      return {
        provider: "exotel",
        status: "manual_app_id_required",
        webhookUrl: config.webhookUrl,
        message: "Exotel credentials are saved. Add an Exotel App/Flow ID to enable automatic webhook updates where your Exotel account supports it."
      };
    }

    const body = new URLSearchParams({
      Url: config.webhookUrl,
      Method: "POST"
    });

    const response = await axios.post(`${baseUrl(config)}/Exophones/${encodeURIComponent(config.phoneNumber)}.json`, body, {
      auth: auth(config),
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    return {
      provider: "exotel",
      status: "configured",
      webhookUrl: config.webhookUrl,
      rawStatus: response.status,
      message: "Exotel webhook update request sent."
    };
  },

  async makeCall(config, payload) {
    const to = payload.phoneNumber || payload.to;
    if (!to) throw new ApiError(400, "Destination phone number is required");

    const body = new URLSearchParams({
      From: config.phoneNumber,
      To: to,
      CallerId: config.phoneNumber,
      Url: payload.webhookUrl || config.webhookUrl
    });

    const response = await axios.post(`${baseUrl(config)}/Calls/connect.json`, body, {
      auth: auth(config),
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    return { provider: "exotel", status: "queued", response: response.data };
  },

  handleIncomingCall({ reply, agent }) {
    const message = reply || agent?.firstMessage || agent?.greetingMessage || "Hello. How can I help you today?";
    return {
      contentType: "text/xml",
      body: `<Response><Say>${escapeXml(message)}</Say></Response>`
    };
  }
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
