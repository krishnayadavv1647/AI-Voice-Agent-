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
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content || "" }]
    }));

  const response = await ai.models.generateContent({
    model: model || process.env.GEMINI_MODEL || "gemini-2.5-flash",
    contents: userMessages,
    config: {
      systemInstruction: systemMessage,
      temperature: settings.temperature ?? 0.4
    }
  });

  const text = response.text?.trim();
  if (!text) throw new ApiError(502, "Gemini returned an empty response.");
  return text;
}
