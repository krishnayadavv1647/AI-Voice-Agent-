import { GoogleGenAI } from "@google/genai";

function clean(value) {
  return value ? String(value).trim() : "";
}

function maskEmail(value = "") {
  const [name, domain] = String(value || "").split("@");
  if (!name || !domain) return value ? "***" : "";
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(value = "") {
  const text = String(value || "");
  if (text.length <= 4) return text ? "***" : "";
  return `${"*".repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
}

function safeExtractionResult(result = {}) {
  return {
    appointmentRequested: Boolean(result.appointmentRequested),
    titlePresent: Boolean(result.title),
    appointmentType: result.appointmentType,
    date: result.date,
    time: result.time,
    timezone: result.timezone,
    customerNamePresent: Boolean(result.customerName),
    customerPhone: maskPhone(result.customerPhone),
    customerEmail: maskEmail(result.customerEmail),
    notesPresent: Boolean(result.notes)
  };
}

function parseJson(text) {
  const cleaned = clean(text).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { appointmentRequested: false };
  }
}

export async function extractAppointmentFromTranscript(transcript, agent, lead) {
  if (!transcript || !clean(transcript)) {
    console.log("[Appointment Debug][AI Call] Transcript appointment extraction result", {
      appointmentRequested: false,
      reason: "missing_transcript"
    });
    return { appointmentRequested: false };
  }
  if (!process.env.GEMINI_API_KEY) {
    console.log("[Appointment Debug][AI Call] Transcript appointment extraction result", {
      appointmentRequested: false,
      reason: "missing_gemini_api_key"
    });
    return { appointmentRequested: false };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `
Extract appointment booking details from this call transcript.

Today: ${today}
Business: ${agent?.businessName || ""}
Agent: ${agent?.agentName || ""}
Lead: ${lead?.name || lead?.businessName || lead?.phone || ""}

Transcript:
${transcript}

Return ONLY valid JSON:
{
  "appointmentRequested": true,
  "title": "",
  "appointmentType": "call | meeting | demo | visit | consultation",
  "date": "YYYY-MM-DD",
  "time": "HH:mm",
  "timezone": "",
  "customerName": "",
  "customerPhone": "",
  "customerEmail": "",
  "notes": ""
}

Rules:
- Return appointmentRequested false unless the customer clearly agrees to a specific date and time.
- Do not create appointments for vague phrases like "tomorrow sometime" or "call later" unless exact time is present.
- Use 24 hour time.
- Use Asia/Calcutta if timezone is not mentioned.
- Do not invent missing date or time.
`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.1, responseMimeType: "application/json" }
    });
    const parsed = parseJson(response.text);
    console.log("[Appointment Debug][AI Call] Transcript appointment extraction result", safeExtractionResult(parsed));
    if (!parsed.appointmentRequested || !parsed.date || !parsed.time) return { appointmentRequested: false };
    const result = {
      appointmentRequested: true,
      title: parsed.title || "Appointment",
      appointmentType: ["call", "meeting", "demo", "visit", "consultation"].includes(parsed.appointmentType) ? parsed.appointmentType : "consultation",
      date: parsed.date,
      time: parsed.time,
      timezone: parsed.timezone || "Asia/Calcutta",
      customerName: parsed.customerName || "",
      customerPhone: parsed.customerPhone || "",
      customerEmail: parsed.customerEmail || "",
      notes: parsed.notes || ""
    };
    console.log("[Appointment Debug][AI Call] Transcript appointment extraction normalized", safeExtractionResult(result));
    return result;
  } catch (error) {
    console.error("[Appointment Debug][AI Call] Transcript appointment extraction result", {
      appointmentRequested: false,
      reason: "extraction_error",
      message: error.message
    });
    return { appointmentRequested: false };
  }
}
