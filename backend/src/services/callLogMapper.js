export function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function getPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

export function hasUsefulLeadData(leadData = {}) {
  if (!leadData) return false;

  return Boolean(
    leadData.customer_name ||
    leadData.customerName ||
    leadData.name ||
    leadData.phone_number ||
    leadData.phoneNumber ||
    leadData.phone ||
    leadData.requirement ||
    leadData.number_of_guests ||
    leadData.numberOfGuests ||
    leadData.booking_date ||
    leadData.bookingDate ||
    leadData.preferred_date ||
    leadData.preferredDate ||
    leadData.booking_time ||
    leadData.bookingTime ||
    leadData.preferred_time ||
    leadData.preferredTime ||
    leadData.special_request ||
    leadData.specialRequest ||
    leadData.email ||
    leadData.message
  );
}

// --- Vapi mapping -----------------------------------------------------------
// Maps a Vapi end-of-call-report / status-update message onto the normalized shape the webhook
// consumes.

// Vapi endedReason → a raw status string that applyCallOutcomeToLog already understands
// (it normalizes to the normalizedStatus enum).
export function mapVapiEndedReasonToStatus(endedReason) {
  const reason = String(endedReason || "").toLowerCase();
  if (!reason) return "completed";

  if (reason.includes("no-answer") || reason.includes("did-not-answer") || reason.includes("noanswer")) {
    return "no_answer";
  }
  if (reason.includes("busy")) return "busy";
  if (
    reason.includes("customer-ended-call") ||
    reason.includes("assistant-ended-call") ||
    reason.includes("hangup") ||
    reason.includes("hung-up") ||
    reason === "completed"
  ) {
    return "completed";
  }
  if (reason.includes("error") || reason.includes("failed") || reason.includes("fail")) {
    return "failed";
  }
  // Unknown/other reasons: treat as completed so the call still finalizes and settles.
  return "completed";
}

export function extractVapiCallFields(message = {}) {
  const call = message.call || {};
  const metadata = call.metadata || message.metadata || {};
  const artifact = message.artifact || {};
  const analysis = message.analysis || {};

  const customerNumber = getPath(call, "customer.number");
  const phoneNumber = getPath(call, "phoneNumber.number");

  const startedAt = toDate(pick(message.startedAt, call.startedAt));
  const endedAt = toDate(pick(message.endedAt, call.endedAt));

  let durationSeconds = toSeconds(pick(message.durationSeconds, message.duration_seconds, call.durationSeconds));
  if ((durationSeconds === undefined || durationSeconds === null) && startedAt && endedAt) {
    const computed = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
    durationSeconds = computed >= 0 ? computed : undefined;
  }

  const callType = call.type || "";
  const callDirection =
    callType === "inboundPhoneCall"
      ? "inbound"
      : callType && callType.toLowerCase().includes("web")
        ? "web"
        : "outbound";

  const rawStatus = mapVapiEndedReasonToStatus(message.endedReason);

  return {
    metadata,
    providerCallId: pick(call.id, message.callId, message.id),
    localAgentId: pick(metadata.localAgentId, metadata.agentId),
    userId: pick(metadata.userId),
    providerAgentId: pick(call.assistantId, message.assistantId),
    // For outbound, the customer number is the callee; the platform number is the caller id.
    callerNumber: pick(customerNumber, phoneNumber),
    callingNumber: pick(phoneNumber, customerNumber),
    endedReason: message.endedReason,
    status: rawStatus,
    transcript: pick(artifact.transcript, message.transcript),
    transcriptUrl: pick(artifact.transcriptUrl, message.transcriptUrl),
    summary: pick(analysis.summary, message.summary),
    recordingUrl: pick(artifact.recordingUrl, message.recordingUrl),
    durationSeconds,
    duration: durationSeconds !== undefined && durationSeconds !== null ? `${durationSeconds}s` : undefined,
    startedAt,
    endedAt,
    callDirection,
    structuredData: analysis.structuredData || null
  };
}

// Normalize a Vapi analysis.structuredData object into the lead shape upsertLead expects.
// Returns {} when no structured data is present so the webhook's autoGenerateLeadFromCall
// fallback takes over.
export function normalizeVapiLeadData(message = {}) {
  const data = getPath(message, "analysis.structuredData");
  if (!data || typeof data !== "object") return {};

  return {
    name: pick(data.name, data.customer_name, data.customerName),
    phone: pick(data.phone, data.phone_number, data.phoneNumber, getPath(message, "call.customer.number")),
    email: pick(data.email),
    requirement: pick(data.requirement, data.message, data.intent),
    preferredDate: pick(data.preferred_date, data.preferredDate),
    preferredTime: pick(data.preferred_time, data.preferredTime),
    budget: pick(data.budget),
    location: pick(data.location),
    message: pick(data.message),
    customFields: data.customFields || data.custom_fields || data
  };
}

function toDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toSeconds(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
