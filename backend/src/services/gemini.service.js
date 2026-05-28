import { GoogleGenAI } from "@google/genai";
import { ApiError } from "../utils/apiError.js";

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new ApiError(500, "GEMINI_API_KEY is missing. Please configure backend environment.");
  }

  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function buildFallbackSystemPrompt(agent) {
  return `
You are ${agent.agentName || "AI Assistant"}, a professional assistant for ${agent.businessName || "the business"}.

Business category:
${agent.businessCategory || "Not provided"}

Business description:
${agent.businessDescription || "Not provided"}

Services:
${agent.services || "Not provided"}

Pricing:
${agent.pricing || "Not provided"}

FAQs:
${agent.faqs || "Not provided"}

Policies:
${agent.policies || "Not provided"}

Offers:
${agent.offers || "Not provided"}

Additional information:
${agent.additionalInfo || "Not provided"}

Rules:
- Answer only using the business information available.
- If you do not know the answer, say the team will confirm and follow up.
- Keep answers short, clear, and helpful.
- Ask one question at a time.
- If the user wants booking or callback, collect name, phone number, and requirement.
- Do not make fake promises.
`;
}

function buildSafetyAddendum(agent) {
  const category = `${agent.businessCategory || ""}`.toLowerCase();

  if (
    category.includes("hospital") ||
    category.includes("clinic") ||
    category.includes("health") ||
    category.includes("medical")
  ) {
    return `
Healthcare safety rules:
- Do not provide medical diagnosis.
- Do not suggest medicines.
- Do not suggest treatment.
- Do not interpret reports.
- For emergencies, advise the user to visit the hospital immediately or contact emergency services.
- For medical questions, recommend consulting a qualified doctor.
`;
  }

  return "";
}

export async function generateAgentTextReply({ systemPrompt, message, agent }) {
  if (!message || !message.trim()) {
    throw new ApiError(400, "Message is required.");
  }

  const ai = getGeminiClient();
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const finalSystemPrompt = `
${systemPrompt || buildFallbackSystemPrompt(agent)}

${buildSafetyAddendum(agent)}

Text chat behavior:
- You are replying in a dashboard/web chat, not a phone call.
- Do not say you are calling.
- Do not mention Twilio or Dograh.
- Keep replies short and practical.
- If booking/callback is needed, ask for details one by one.
`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [{ text: message }]
        }
      ],
      config: {
        systemInstruction: finalSystemPrompt,
        temperature: 0.4
      }
    });

    const text = response.text?.trim();

    if (!text) {
      throw new ApiError(502, "Gemini returned an empty response.");
    }

    return text;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    console.error("Gemini text reply failed status:", error.status);
    console.error("Gemini text reply failed data:", error.response?.data || error.error);
    console.error("Gemini text reply failed message:", error.message);

    throw new ApiError(
      error.status || 502,
      error.response?.data?.error?.message ||
        error.error?.message ||
        error.message ||
        "Gemini text reply failed."
    );
  }
}
