import axios from "axios";
import { ApiError } from "../utils/apiError.js";
import { decryptSecret } from "../utils/secretCrypto.js";

function auth(config) {
  return {
    username: config.accountSid,
    password: decryptSecret(config.authToken)
  };
}

function baseUrl(config) {
  return `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}`;
}

async function findIncomingNumber(config) {
  try {
    const response = await axios.get(`${baseUrl(config)}/IncomingPhoneNumbers.json`, {
      auth: auth(config),
      params: {
        PhoneNumber: config.phoneNumber,
        PageSize: 1
      }
    });
    return response.data?.incoming_phone_numbers?.[0];
  } catch (error) {
    logTwilioError("find incoming phone number", error);
    throw new ApiError(error.response?.status || 502, "Twilio phone number lookup failed", twilioErrorDetails(error));
  }
}

function validateTwilioWebhookConfig(config) {
  if (!config.accountSid) throw new ApiError(400, "Twilio Account SID is required");
  if (!config.authToken) throw new ApiError(400, "Twilio Auth Token is required");
  if (!config.phoneNumber) throw new ApiError(400, "Twilio phone number is required");
  if (!config.webhookUrl) throw new ApiError(400, "Twilio webhook URL is required");

  if (!String(config.webhookUrl).startsWith("https://")) {
    throw new ApiError(400, "Twilio webhook URL must be public HTTPS. Localhost cannot receive Twilio calls.");
  }
}

function safeUrlLog(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}${url.search ? "?..." : ""}`;
  } catch {
    return "<invalid-url>";
  }
}

function twilioErrorDetails(error) {
  const data = error.response?.data || {};
  return {
    status: error.response?.status,
    message: data.message || error.message,
    code: data.code,
    moreInfo: data.more_info || data.moreInfo,
    details: data.details
  };
}

function logTwilioError(action, error) {
  const details = twilioErrorDetails(error);
  console.error(`[Twilio] Failed to ${action}`, details);
}

export const TwilioTelephony = {
  saveConfig(config) {
    if (!config.accountSid || !config.authToken) {
      throw new ApiError(400, "Twilio Account SID and Auth Token are required");
    }
    return config;
  },

  async testConnection(config) {
    const response = await axios.get(`${baseUrl(config)}.json`, { auth: auth(config) });
    return {
      provider: "twilio",
      status: "connected",
      accountSid: response.data?.sid,
      message: "Twilio credentials verified."
    };
  },

  async configureWebhook(config) {
    validateTwilioWebhookConfig(config);

    const number = await findIncomingNumber(config);
    if (!number?.sid) {
      throw new ApiError(404, "Twilio phone number not found in this account");
    }

    const phoneNumberSid = number.sid;
    const body = new URLSearchParams({
      VoiceUrl: config.webhookUrl,
      VoiceMethod: config.webhookMethod || "POST"
    });

    try {
      const response = await axios.post(`${baseUrl(config)}/IncomingPhoneNumbers/${phoneNumberSid}.json`, body, {
        auth: auth(config),
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
      const verified = await axios.get(`${baseUrl(config)}/IncomingPhoneNumbers/${phoneNumberSid}.json`, {
        auth: auth(config)
      });
      const voiceUrl = verified.data?.voice_url || verified.data?.voiceUrl || response.data?.voice_url || response.data?.voiceUrl || config.webhookUrl;
      const voiceMethod = verified.data?.voice_method || verified.data?.voiceMethod || response.data?.voice_method || response.data?.voiceMethod || config.webhookMethod || "POST";

      return {
        success: true,
        provider: "twilio",
        status: "configured",
        phoneNumberSid,
        voiceUrl,
        voiceMethod,
        message: `Twilio voice webhook configured to ${safeUrlLog(voiceUrl)}.`
      };
    } catch (error) {
      logTwilioError("configure voice webhook", error);
      throw new ApiError(error.response?.status || 502, "Twilio webhook configuration failed", twilioErrorDetails(error));
    }
  },

  async getWebhookConfig(config) {
    validateTwilioWebhookConfig({ ...config, webhookUrl: config.webhookUrl || "https://example.com" });
    const number = await findIncomingNumber(config);
    if (!number?.sid) {
      throw new ApiError(404, "Twilio phone number not found in this account");
    }

    return {
      provider: "twilio",
      phoneNumberSid: number.sid,
      voiceUrl: number.voice_url || number.voiceUrl || "",
      voiceMethod: number.voice_method || number.voiceMethod || "POST",
      statusCallback: number.status_callback || number.statusCallback || ""
    };
  },

  async makeCall(config, payload) {
    const to = payload.phoneNumber || payload.to;
    if (!to) throw new ApiError(400, "Destination phone number is required");

    const body = new URLSearchParams({
      To: to,
      From: config.phoneNumber,
      Url: payload.webhookUrl || config.webhookUrl
    });

    const response = await axios.post(`${baseUrl(config)}/Calls.json`, body, {
      auth: auth(config),
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    return { provider: "twilio", status: response.data?.status, callSid: response.data?.sid };
  },

  handleIncomingCall({ reply, agent, config }) {
    const inboundMode = config?.inboundMode || (config?.inboundEnabled === false ? "disabled" : "dograh_ai");

    if (inboundMode === "disabled") {
      return buildFailureResponse("Inbound calling is currently unavailable.");
    }

    if (inboundMode === "dograh_ai") {
      if (!config?.dograhInboundWebhookUrl) {
        return buildFailureResponse("We are unable to connect your call right now. Please try again later.");
      }

      return {
        contentType: "text/xml",
        body: `<Response><Redirect method="POST">${escapeXml(config.dograhInboundWebhookUrl)}</Redirect></Response>`
      };
    }

    const message = reply || agent?.firstMessage || agent?.greetingMessage || "Hello. How can I help you today?";
    return {
      contentType: "text/xml",
      body: `<Response><Say voice="alice">${escapeXml(message)}</Say></Response>`
    };
  }
};

function buildFailureResponse(message) {
  return {
    contentType: "text/xml",
    body: `<Response><Say voice="alice">${escapeXml(message)}</Say><Hangup/></Response>`
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
