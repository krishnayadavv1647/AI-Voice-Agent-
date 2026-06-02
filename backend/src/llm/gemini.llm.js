import { GoogleGenAI } from "@google/genai";
import { ApiError } from "../utils/apiError.js";

export async function generateGeminiResponse({ model, messages, settings = {} }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new ApiError(500, "Gemini provider is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const systemMessage = messages.find((message) => message.role === "system")?.content || "";
  const userMessages = messages
    .filter((message) => message.role !== "system")
    .filter((message) => message.content && String(message.content).trim())
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content).trim() }]
    }));

  if (!userMessages.length) {
    throw new ApiError(400, "Message is required.");
  }

  try {
    const response = await ai.models.generateContent({
      model: model || process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: userMessages,
      config: {
        systemInstruction: systemMessage || undefined,
        temperature: settings.temperature ?? 0.4
      }
    });

    const text = response.text?.trim();
    if (!text) throw new ApiError(502, "Gemini returned an empty response.");
    return text;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    const geminiError = parseGeminiError(error);
    const details = {
      status: error.status || error.response?.status || geminiError.status,
      message: geminiError.message,
      code: geminiError.code,
      details: geminiError.details
    };

    console.error("Gemini LLM response failed:", details);

    throw new ApiError(
      details.status || 502,
      friendlyGeminiMessage(details),
      details
    );
  }
}

function parseGeminiError(error) {
  const raw = error.response?.data?.error || error.error || error.message;

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed.error || parsed;
    } catch {
      return { message: raw };
    }
  }

  return raw || { message: error.message };
}

function friendlyGeminiMessage(details) {
  const message = details.message || "Gemini text reply failed.";

  if (details.status === 429 || details.code === 429 || /quota|RESOURCE_EXHAUSTED/i.test(message)) {
    const retryDelay = findRetryDelay(details.details);
    return retryDelay
      ? `Gemini quota exceeded. Please retry in about ${retryDelay}, or enable billing/increase quota for the Gemini API.`
      : "Gemini quota exceeded. Enable billing/increase quota for the Gemini API, or try again later.";
  }

  return message;
}

function findRetryDelay(details) {
  if (!Array.isArray(details)) return "";
  const retryInfo = details.find((item) => item?.retryDelay);
  if (!retryInfo?.retryDelay) return "";
  return String(retryInfo.retryDelay).replace(/s$/, " seconds");
}
