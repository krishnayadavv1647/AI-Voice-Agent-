import axios from "axios";
import { ApiError } from "../../../utils/apiError.js";

function apiKey() {
  return String(process.env.BREVO_API_KEY || "").trim();
}

function sender() {
  return {
    email: String(process.env.FROM_EMAIL || "").trim(),
    name: String(process.env.FROM_NAME || "AI Voice Agent").trim()
  };
}

export async function sendEmail({ toEmail, toName, subject, body, replyTo }) {
  if (!isConfigured()) {
    throw new ApiError(400, "Brevo email provider is not configured.");
  }

  const response = await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: sender(),
      to: [{ email: toEmail, name: toName || toEmail }],
      subject,
      htmlContent: `<html><body>${String(body || "").replace(/\n/g, "<br>")}</body></html>`,
      ...(replyTo ? { replyTo: { email: replyTo } } : {})
    },
    {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey()
      },
      timeout: 20000
    }
  );

  return {
    success: true,
    provider: "brevo",
    messageId: response.data?.messageId,
    toEmail,
    toName,
    subject
  };
}

export function isConfigured() {
  const from = sender();
  return Boolean(apiKey() && from.email);
}
