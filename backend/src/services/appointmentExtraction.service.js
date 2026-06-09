import { GoogleGenAI } from "@google/genai";

function clean(value) {
  return value ? String(value).trim() : "";
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
  if (!transcript || !clean(transcript)) return { appointmentRequested: false };
  if (!process.env.GEMINI_API_KEY) return { appointmentRequested: false };

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
    if (!parsed.appointmentRequested || !parsed.date || !parsed.time) return { appointmentRequested: false };
    return {
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
  } catch (error) {
    console.error("Appointment extraction failed:", error.message);
    return { appointmentRequested: false };
  }
}
