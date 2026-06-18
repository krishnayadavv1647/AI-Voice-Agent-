import axios from "axios";
import { ApiError } from "../utils/apiError.js";
import { decryptCredential } from "./credentialEncryptionService.js";

const BREVO_BASE_URL = "https://api.brevo.com/v3";

function headers(apiKey) {
  return { accept: "application/json", "api-key": apiKey };
}

function safeBrevoError(error) {
  if (error.response?.status === 401 || error.response?.status === 403) {
    return new ApiError(400, "The Brevo API key is invalid or expired.");
  }
  return new ApiError(502, "Brevo connection failed. Please try again.");
}

export async function validateBrevoAccount(apiKey) {
  try {
    const response = await axios.get(`${BREVO_BASE_URL}/account`, { headers: headers(apiKey), timeout: 20000 });
    return response.data || {};
  } catch (error) {
    throw safeBrevoError(error);
  }
}

export async function fetchBrevoSenders(apiKey) {
  try {
    const response = await axios.get(`${BREVO_BASE_URL}/senders`, { headers: headers(apiKey), timeout: 20000 });
    const senders = Array.isArray(response.data?.senders) ? response.data.senders : Array.isArray(response.data) ? response.data : [];
    return senders.map((sender) => ({
      id: String(sender.id || sender.senderId || ""),
      name: String(sender.name || sender.fromName || ""),
      email: String(sender.email || sender.fromEmail || "").trim().toLowerCase(),
      active: sender.active !== false && sender.status !== "inactive"
    })).filter((sender) => sender.email);
  } catch (error) {
    throw safeBrevoError(error);
  }
}

export async function sendUserBrevoEmail({ integration, toEmail, toName, subject, htmlContent, textContent, body }) {
  if (!integration?.brevo?.connected) throw new ApiError(400, "Connect your Brevo account before sending emails.");
  const senderEmail = String(integration.brevo.senderEmail || "").trim().toLowerCase();
  const verified = (integration.brevo.verifiedSenders || []).some((sender) => sender.email === senderEmail && sender.active !== false);
  if (!senderEmail || !verified) throw new ApiError(400, "Select a verified sender email.");
  if (!integration.brevo.replyToEmail) throw new ApiError(400, "Reply-to email is required before sending emails.");
  if (!toEmail || !subject || !(htmlContent || textContent || body)) throw new ApiError(400, "Recipient, subject, and content are required.");

  const apiKey = decryptCredential(integration.brevo.apiKeyEncrypted);
  const payload = {
    sender: { name: integration.brevo.senderName || senderEmail, email: senderEmail },
    replyTo: {
      name: integration.brevo.replyToName || integration.brevo.senderName || "",
      email: integration.brevo.replyToEmail
    },
    to: [{ email: toEmail, name: toName || toEmail }],
    subject,
    htmlContent: htmlContent || `<html><body>${String(body || textContent || "").replace(/\n/g, "<br>")}</body></html>`,
    textContent: textContent || body || ""
  };

  try {
    const response = await axios.post(`${BREVO_BASE_URL}/smtp/email`, payload, {
      headers: { ...headers(apiKey), "content-type": "application/json" },
      timeout: 20000
    });
    return {
      success: true,
      provider: "brevo",
      messageId: response.data?.messageId || "",
      toEmail,
      toName,
      subject
    };
  } catch (error) {
    throw new ApiError(error.response?.status === 401 ? 400 : 502, "Brevo failed to send the email.");
  }
}
