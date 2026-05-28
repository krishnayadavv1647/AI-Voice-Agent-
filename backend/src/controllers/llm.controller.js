import { asyncHandler } from "../utils/asyncHandler.js";

export const llmDebug = asyncHandler(async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  res.json({
    geminiApiKeyExists: Boolean(apiKey),
    geminiApiKeyPreview: apiKey ? `${apiKey.slice(0, 6)}...` : "MISSING",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash"
  });
});
