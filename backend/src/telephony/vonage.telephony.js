import axios from "axios";
import { ApiError } from "../utils/apiError.js";
import { decryptSecret } from "../utils/secretCrypto.js";

function credentials(config) {
  return {
    api_key: config.apiKey || config.accountSid,
    api_secret: decryptSecret(config.apiSecret || config.authToken)
  };
}

export const VonageTelephony = {
  saveConfig(config) {
    if (!(config.apiKey || config.accountSid) || !(config.apiSecret || config.authToken)) {
      throw new ApiError(400, "Vonage API Key and API Secret are required");
    }
    return config;
  },

  async testConnection(config) {
    const response = await axios.get("https://rest.nexmo.com/account/get-balance", {
      params: credentials(config)
    });

    return {
      provider: "vonage",
      status: "connected",
      balance: response.data?.value,
      message: "Vonage credentials verified."
    };
  },

  async configureWebhook(config) {
    if (!config.webhookUrl) throw new ApiError(400, "Webhook URL is required before configuring Vonage");

    if (!config.appId) {
      return {
        provider: "vonage",
        status: "voice_application_required",
        webhookUrl: config.webhookUrl,
        message: "Vonage numbers are linked to a Voice Application. Add the Vonage Application ID to update the phone number automatically."
      };
    }

    const response = await axios.post("https://rest.nexmo.com/number/update", null, {
      params: {
        ...credentials(config),
        country: config.country || process.env.VONAGE_COUNTRY || "US",
        msisdn: config.phoneNumber.replace(/^\+/, ""),
        voiceCallbackType: "app",
        voiceCallbackValue: config.appId
      }
    });

    return {
      provider: "vonage",
      status: response.data?.error-code === "200" ? "configured" : "submitted",
      webhookUrl: config.webhookUrl,
      response: response.data,
      message: "Vonage number webhook update submitted."
    };
  },

  async makeCall() {
    return {
      provider: "vonage",
      status: "voice_application_required",
      message: "Vonage outbound voice calls require a Voice Application private key. Add that credential before enabling makeCall."
    };
  },

  handleIncomingCall({ reply, agent }) {
    return {
      contentType: "application/json",
      body: [
        {
          action: "talk",
          text: reply || agent?.firstMessage || agent?.greetingMessage || "Hello. How can I help you today?"
        }
      ]
    };
  }
};
