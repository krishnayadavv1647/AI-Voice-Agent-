import { ApiError } from "../utils/apiError.js";
import { generateGeminiResponse } from "./gemini.llm.js";
import { generateOpenAIResponse } from "./openai.llm.js";

export async function generateLLMResponse({ provider = "gemini", model, messages, settings }) {
  switch (provider) {
    case "gemini":
      return generateGeminiResponse({ model, messages, settings });
    case "openai":
      return generateOpenAIResponse({ model, messages, settings });
    default:
      throw new ApiError(400, `LLM provider missing or unsupported: ${provider}`);
  }
}
