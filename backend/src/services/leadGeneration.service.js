import axios from "axios";
import { ApiError } from "../utils/apiError.js";
import Agent from "../models/Agent.js";
import Lead from "../models/Lead.js";
import { hasUsefulLeadData } from "./callLogMapper.js";
import { normalizeLeadToEnglish } from "./leadEnglishNormalizer.js";
import { extractLeadFromCallTranscript } from "./leadExtraction.service.js";
import { createAppointmentRecord } from "./appointment.service.js";
import { extractAppointmentFromTranscript } from "./appointmentExtraction.service.js";

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

function safeAppointmentExtraction(result = {}) {
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

function safeAppointmentResult(result = {}) {
  const appointment = result.appointment || result;
  return {
    created: result.created,
    appointmentId: appointment?._id?.toString?.(),
    userId: appointment?.userId?.toString?.(),
    agentId: appointment?.agentId?.toString?.(),
    leadId: appointment?.leadId?.toString?.(),
    callLogId: appointment?.callLogId?.toString?.(),
    startAt: appointment?.startAt,
    status: appointment?.status,
    source: appointment?.source,
    customerPhone: maskPhone(appointment?.customerPhone),
    customerEmail: maskEmail(appointment?.customerEmail),
    meta: result.meta
  };
}

async function fetchTranscriptFromUrl(transcriptUrl) {
  if (!transcriptUrl) return null;

  const response = await axios.get(transcriptUrl, {
    responseType: "text"
  });

  return typeof response.data === "string"
    ? response.data
    : JSON.stringify(response.data);
}

function buildLeadPayload(callLog, leadData) {
  return normalizeLeadToEnglish({
    userId: callLog.userId,
    agentId: callLog.agentId,
    callLogId: callLog._id,
    name:
      leadData.customer_name ||
      leadData.customerName ||
      leadData.name ||
      "",
    phone:
      leadData.phone_number ||
      leadData.phoneNumber ||
      leadData.phone ||
      callLog.callerNumber ||
      "",
    email: leadData.email || "",
    requirement:
      leadData.requirement ||
      leadData.intent ||
      "",
    preferredDate:
      leadData.booking_date ||
      leadData.preferred_date ||
      leadData.preferredDate ||
      "",
    preferredTime:
      leadData.booking_time ||
      leadData.preferred_time ||
      leadData.preferredTime ||
      "",
    customFields: {
      numberOfGuests: leadData.number_of_guests || leadData.numberOfGuests || "",
      specialRequest: leadData.special_request || leadData.specialRequest || "",
      confidence: leadData.confidence || "",
      rawExtraction: leadData
    },
    source: "call",
    status: "New"
  });
}

export async function upsertLeadFromCallData(callLog, leadData) {
  if (!hasUsefulLeadData(leadData) && !callLog.callerNumber) return false;
  if (!callLog.userId || !callLog.agentId) return false;

  const leadPayload = buildLeadPayload(callLog, leadData || {});
  const existingLead = await Lead.findOne({ callLogId: callLog._id });

  if (existingLead) {
    Object.assign(existingLead, {
      ...leadPayload,
      status: existingLead.status || "New",
      notes: existingLead.notes
    });
    await existingLead.save();
    return { lead: existingLead, created: false };
  }

  const lead = await Lead.create(leadPayload);
  return { lead, created: true };
}

export async function autoCreateAppointmentFromCall(callLog, lead) {
  console.log("[Appointment Debug][AI Call] Auto appointment flow start", {
    callLogId: callLog?._id?.toString(),
    userId: callLog?.userId?.toString(),
    agentId: callLog?.agentId?.toString(),
    leadId: lead?._id?.toString(),
    hasLead: Boolean(lead),
    hasTranscript: Boolean(callLog?.transcript),
    transcriptLength: callLog?.transcript ? String(callLog.transcript).length : 0
  });
  if (!lead || !callLog.transcript) {
    console.log("[Appointment Debug][AI Call] Appointment creation result after AI call", {
      created: false,
      reason: !lead ? "missing_lead" : "missing_transcript"
    });
    return null;
  }
  const agent = callLog.agentId ? await Agent.findById(callLog.agentId) : null;
  if (!agent) {
    console.log("[Appointment Debug][AI Call] Appointment creation result after AI call", {
      created: false,
      reason: "missing_agent",
      callLogId: callLog._id?.toString(),
      agentId: callLog.agentId?.toString()
    });
    return null;
  }

  const extracted = await extractAppointmentFromTranscript(callLog.transcript, agent, lead);
  console.log("[Appointment Debug][AI Call] Call transcript appointment extraction result", safeAppointmentExtraction(extracted));
  if (!extracted.appointmentRequested || !extracted.date || !extracted.time) {
    console.log("[Appointment Debug][AI Call] Appointment creation result after AI call", {
      created: false,
      reason: "appointment_not_requested_or_missing_date_time",
      extracted: safeAppointmentExtraction(extracted)
    });
    return null;
  }

  const source = callLog.source === "web_call" || callLog.source === "callback_form" ? "web_call" : "ai_call";
  try {
    const result = await createAppointmentRecord({
      userId: callLog.userId,
      agent,
      lead,
      callLogId: callLog._id,
      title: extracted.title,
      appointmentType: extracted.appointmentType,
      date: extracted.date,
      time: extracted.time,
      timezone: extracted.timezone || "Asia/Calcutta",
      customerName: extracted.customerName,
      customerPhone: extracted.customerPhone,
      customerEmail: extracted.customerEmail,
      notes: extracted.notes,
      source,
      reminderEnabled: true
    });
    console.log("[Appointment Debug][AI Call] Appointment creation result after AI call", safeAppointmentResult(result));
    return result.appointment;
  } catch (error) {
    console.error("[Appointment Debug][AI Call] Appointment creation result after AI call", {
      created: false,
      reason: "createAppointmentRecord_error",
      message: error.message,
      extracted: safeAppointmentExtraction(extracted)
    });
    return null;
  }
}

export async function extractLeadForCallLog(callLog, { failOnGeminiError }) {
  if (!callLog.transcript && callLog.transcriptUrl) {
    console.log("Transcript URL:", callLog.transcriptUrl);

    try {
      const transcript = await fetchTranscriptFromUrl(callLog.transcriptUrl);
      console.log("Transcript length:", transcript?.length);

      if (transcript) {
        callLog.transcript = transcript;
        await callLog.save();
      }
    } catch (error) {
      console.error("Transcript fetch failed:", { status: error.response?.status, message: error.message });
      if (failOnGeminiError) {
        throw new ApiError(502, "Transcript fetch failed. Please try again once the call transcript is ready.");
      }
    }
  } else {
    console.log("Transcript URL:", callLog.transcriptUrl);
    console.log("Transcript length:", callLog.transcript?.length);
  }

  if (!callLog.transcript) {
    if (failOnGeminiError) throw new ApiError(400, "Transcript is missing. Sync the call first or wait for the call transcript.");
    return { callLog, lead: null, extracted: null };
  }

  const agent = callLog.agentId ? await Agent.findById(callLog.agentId) : null;

  try {
    const extracted = await extractLeadFromCallTranscript({
      transcript: callLog.transcript,
      agent,
      callLog
    });

    console.log("Gemini lead extraction result:", extracted);

    if (!extracted.leadCaptured) {
      callLog.leadCaptured = false;
      callLog.leadData = null;
      await callLog.save();
      return { callLog, lead: null, extracted };
    }

    const leadData = {
      name: extracted.name,
      phone: extracted.phone,
      email: extracted.email,
      requirement: extracted.requirement,
      preferredDate: extracted.preferredDate,
      preferredTime: extracted.preferredTime,
      numberOfGuests: extracted.numberOfGuests,
      specialRequest: extracted.specialRequest,
      summary: extracted.summary,
      confidence: extracted.confidence
    };

    const leadResult = await upsertLeadFromCallData(callLog, leadData);

    if (leadResult) {
      callLog.leadCaptured = true;
      callLog.leadData = extracted;
      callLog.leadId = leadResult.lead._id;
      callLog.summary = callLog.summary || extracted.summary;
      await callLog.save();
      console.log("Lead created/updated:", leadResult.lead?._id);

      if (leadResult.created && callLog.agentId) {
        await Agent.findByIdAndUpdate(callLog.agentId, { $inc: { totalLeads: 1 } });
      }
      await autoCreateAppointmentFromCall(callLog, leadResult.lead);
    }

    return { callLog, lead: leadResult?.lead || null, extracted };
  } catch (error) {
    console.error("Gemini lead extraction result failed:", error.message);
    if (failOnGeminiError) throw error;
    return { callLog, lead: null, extracted: null };
  }
}

/**
 * Auto-generate a lead when a call ends. Safe to call from webhook/background-sync
 * paths: it never throws, skips when a lead was already captured, and only runs
 * the Gemini transcript extraction when a transcript (or transcript URL) exists.
 */
export async function autoGenerateLeadFromCall(callLog) {
  if (!callLog) return null;
  if (callLog.leadCaptured && hasUsefulLeadData(callLog.leadData)) return null;
  if (!callLog.transcript && !callLog.transcriptUrl && !callLog.callerNumber) return null;

  try {
    const result = await extractLeadForCallLog(callLog, { failOnGeminiError: false });
    if (result?.lead || !callLog.callerNumber) return result;

    const fallbackLeadResult = await upsertLeadFromCallData(callLog, {
      phone: callLog.callerNumber,
      summary: callLog.summary,
      requirement: callLog.summary || ""
    });

    if (fallbackLeadResult) {
      callLog.leadCaptured = true;
      callLog.leadData = {
        phone: callLog.callerNumber,
        summary: callLog.summary || "",
        source: "caller_number_fallback"
      };
      callLog.leadId = fallbackLeadResult.lead._id;
      await callLog.save();

      if (fallbackLeadResult.created && callLog.agentId) {
        await Agent.findByIdAndUpdate(callLog.agentId, { $inc: { totalLeads: 1 } });
      }

      return { callLog, lead: fallbackLeadResult.lead, extracted: callLog.leadData };
    }

    return result;
  } catch (error) {
    console.error("[Lead Auto-Gen] Failed to auto-generate lead on call end:", {
      callLogId: callLog?._id?.toString(),
      message: error.message
    });
    return null;
  }
}
