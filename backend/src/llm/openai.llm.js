import axios from "axios";
import { ApiError } from "../utils/apiError.js";

export async function generateOpenAIResponse({ model, messages, settings = {} }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new ApiError(500, "OpenAI provider is not configured.");
  }

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: model || process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      temperature: settings.temperature ?? 0.4
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const text = response.data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new ApiError(502, "OpenAI returned an empty response.");
  return text;
}
