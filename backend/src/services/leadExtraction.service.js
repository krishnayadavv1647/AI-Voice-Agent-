import { GoogleGenAI } from "@google/genai";
import { ApiError } from "../utils/apiError.js";

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new ApiError(500, "GEMINI_API_KEY is missing. Please configure backend environment.");
  }

  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function parseJsonResponse(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new ApiError(502, "Gemini did not return valid lead JSON.");
    return JSON.parse(match[0]);
  }
}

export async function extractLeadFromCallTranscript({ transcript, agent, callLog }) {
  if (!transcript || !String(transcript).trim()) {
    throw new ApiError(400, "Transcript is required for lead extraction.");
  }

  const ai = getGeminiClient();
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const prompt = `
You are a lead extraction engine.

Extract lead details from this call transcript.

Business/Agent:
Agent Name: ${agent?.agentName || "Not provided"}
Business Name: ${agent?.businessName || "Not provided"}
Business Category: ${agent?.businessCategory || "Not provided"}

Call Transcript:
${transcript}

Return ONLY valid JSON with this structure:

{
  "leadCaptured": true or false,
  "name": "",
  "phone": "",
  "email": "",
  "requirement": "",
  "preferredDate": "",
  "preferredTime": "",
  "numberOfGuests": "",
  "specialRequest": "",
  "summary": "",
  "confidence": "low | medium | high"
}

Rules:
- Return all structured lead data in English only. Transliterate Hindi names, translate requirements, and convert date/time into English format. Never return Hindi text in CRM fields.
- leadCaptured should be true if the caller showed interest, asked for booking, gave requirement, or provided any useful customer detail.
- Do not invent name, phone, date, time, or guest count.
- If phone is not spoken in transcript, use empty string.
- If caller asks for table booking, requirement should be "Table booking".
- If caller asks about menu, requirement should be "Menu inquiry".
- If caller asks for takeaway, requirement should be "Takeaway inquiry".
- For restaurant booking calls, map "kitne guests", "4 log", "2 people" to numberOfGuests.
- For restaurant booking calls, map "12 tareekh", "barah tareekh" to preferredDate.
- For restaurant booking calls, map "4 baje", "04:00" to preferredTime.
- For restaurant booking calls, map "table book", "booking", "reservation" to requirement "Table booking".
- Keep summary short.
- Do not mention Twilio or Gemini in the JSON.
`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    });

    const parsed = parseJsonResponse(response.text);

    return {
      leadCaptured: Boolean(parsed.leadCaptured),
      name: parsed.name || "",
      phone: parsed.phone || "",
      email: parsed.email || "",
      requirement: parsed.requirement || "",
      preferredDate: parsed.preferredDate || "",
      preferredTime: parsed.preferredTime || "",
      numberOfGuests: parsed.numberOfGuests || "",
      specialRequest: parsed.specialRequest || "",
      summary: parsed.summary || "",
      confidence: ["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "low"
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;

    console.error("Gemini lead extraction failed status:", error.status);
    console.error("Gemini lead extraction failed data:", error.response?.data || error.error);
    console.error("Gemini lead extraction failed message:", error.message);

    throw new ApiError(
      error.status || 502,
      error.response?.data?.error?.message ||
        error.error?.message ||
        error.message ||
        "Gemini lead extraction failed."
    );
  }
}
