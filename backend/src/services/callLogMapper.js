export function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function getPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

export function extractRunId(payload = {}) {
  return (
    payload.workflow_run_id ||
    payload.workflowRunId ||
    payload.run_id ||
    payload.runId ||
    payload.call_id ||
    payload.callId ||
    payload.id ||
    payload.data?.workflow_run_id ||
    payload.data?.workflowRunId ||
    payload.data?.run_id ||
    payload.data?.runId ||
    payload.data?.call_id ||
    payload.data?.callId ||
    payload.data?.id ||
    payload.run?.id ||
    payload.run?.run_id ||
    payload.run?.runId ||
    payload.workflow_run?.id ||
    payload.workflowRun?.id ||
    null
  );
}

export function normalizeDograhRunDetails(runDetails = {}) {
  const data =
    runDetails?.data?.run ||
    runDetails?.data ||
    runDetails?.run ||
    runDetails;

  const callbacks = data?.logs?.telephony_status_callbacks || [];
  const completedCallback =
    callbacks.find((callback) => callback.status === "completed" || callback.CallStatus === "completed") ||
    callbacks[callbacks.length - 1] ||
    null;

  const durationFromCostInfo = data?.cost_info?.call_duration_seconds;
  const durationFromCallback =
    completedCallback?.CallDuration ||
    completedCallback?.duration ||
    completedCallback?.Duration;

  const durationSeconds =
    Number(durationFromCostInfo) ||
    Number(durationFromCallback) ||
    null;

  const status =
    data?.gathered_context?.mapped_call_disposition ||
    data?.gathered_context?.call_disposition ||
    completedCallback?.CallStatus ||
    completedCallback?.status ||
    (data?.is_completed ? "completed" : null) ||
    data?.status ||
    "pending";

  const startedAt =
    data?.created_at ||
    data?.started_at ||
    data?.startedAt ||
    callbacks[0]?.timestamp ||
    null;

  const endedAt =
    data?.ended_at ||
    data?.endedAt ||
    completedCallback?.timestamp ||
    null;

  const transcriptUrl =
    data?.transcript_public_url ||
    data?.transcriptUrl ||
    data?.transcript_url ||
    null;

  const recordingUrl =
    data?.recording_public_url ||
    data?.recordingUrl ||
    data?.recording_url ||
    null;

  const transcript =
    data?.transcript ||
    data?.full_transcript ||
    data?.conversation_transcript ||
    data?.messages ||
    null;

  const summary =
    data?.summary ||
    data?.call_summary ||
    data?.callSummary ||
    data?.analysis?.summary ||
    data?.metadata?.summary ||
    null;

  const realtimeLeadData = extractRealtimeLeadData(data?.logs?.realtime_feedback_events || []);

  const leadData =
    data?.leadData ||
    data?.lead_data ||
    data?.extracted_variables ||
    data?.extractedVariables ||
    data?.variables ||
    data?.extraction ||
    data?.analysis?.extracted_variables ||
    data?.analysis?.extractedVariables ||
    data?.gathered_context?.extracted_variables ||
    data?.gathered_context?.extractedVariables ||
    data?.gathered_context?.variables ||
    realtimeLeadData ||
    null;

  return {
    status,
    durationSeconds,
    duration: durationSeconds ? `${durationSeconds}s` : null,
    startedAt,
    endedAt,
    transcript,
    transcriptUrl,
    recordingUrl,
    summary,
    leadData
  };
}

export const mapDograhRunToCallLog = normalizeDograhRunDetails;

export function extractCallFields(payload = {}) {
  const metadata = payload.metadata || payload.data?.metadata || payload.run?.metadata || {};
  const runId = extractRunId(payload);
  const durationValue = pick(
    payload.duration,
    payload.duration_seconds,
    payload.durationSeconds,
    payload.call_duration,
    payload.callDuration,
    payload.data?.duration,
    payload.data?.duration_seconds,
    payload.run?.duration,
    payload.call?.duration
  );

  return {
    metadata,
    localAgentId: pick(metadata.localAgentId, metadata.agentId, payload.localAgentId, payload.agentId, payload.data?.localAgentId, payload.data?.agentId),
    dograhWorkflowUuid: pick(
      metadata.dograhWorkflowUuid,
      payload.dograhWorkflowUuid,
      payload.workflow_uuid,
      payload.workflowUuid,
      payload.data?.dograhWorkflowUuid,
      payload.data?.workflow_uuid,
      payload.workflow?.workflow_uuid,
      payload.workflow?.uuid
    ),
    dograhWorkflowId: pick(
      metadata.dograhWorkflowId,
      payload.dograhWorkflowId,
      payload.workflow_id,
      payload.workflowId,
      payload.data?.dograhWorkflowId,
      payload.data?.workflow_id,
      payload.workflow?.id
    ),
    dograhRunId: runId,
    callerNumber: pick(payload.callerNumber, payload.caller_number, payload.phone_number, payload.phoneNumber, payload.data?.callerNumber, payload.data?.phone_number, payload.call?.phone_number),
    callingNumber: pick(payload.callingNumber, payload.calling_number, payload.caller_id, payload.data?.callingNumber, payload.data?.calling_number, payload.call?.calling_number),
    status: pick(payload.status, payload.call_status, payload.callStatus, payload.event, payload.state, payload.data?.status, payload.data?.event, payload.run?.status),
    duration: durationValue !== undefined && durationValue !== null ? String(durationValue) : undefined,
    durationSeconds: toSeconds(durationValue),
    transcript: pick(payload.transcript, payload.full_transcript, payload.conversation_transcript, payload.transcript_text, payload.data?.transcript, payload.artifacts?.transcript),
    summary: pick(payload.summary, payload.call_summary, payload.data?.summary, payload.run?.summary),
    recordingUrl: pick(payload.recording_url, payload.recordingUrl, payload.recording, payload.data?.recording_url, payload.data?.recording, payload.artifacts?.recording_url),
    transcriptUrl: pick(payload.transcript_url, payload.transcriptUrl, payload.data?.transcript_url, payload.artifacts?.transcript_url),
    startedAt: toDate(pick(payload.started_at, payload.startedAt, payload.start_time, payload.created_at, payload.data?.started_at, payload.call?.started_at)),
    endedAt: toDate(pick(payload.ended_at, payload.endedAt, payload.end_time, payload.completed_at, payload.data?.ended_at, payload.call?.ended_at))
  };
}

export function normalizeLeadData(payload = {}) {
  const leadData = pick(
    payload.leadData,
    payload.lead_data,
    payload.extracted_variables,
    payload.variables,
    payload.extraction,
    payload.extracted_fields,
    payload.extractedFields,
    payload.data?.leadData,
    payload.data?.lead_data,
    payload.data?.extracted_variables,
    payload.data?.variables,
    payload.data?.extraction,
    {}
  );

  return {
    name: pick(leadData.name, leadData.customer_name, leadData.customerName, payload.name, payload.customer_name),
    phone: pick(leadData.phone, leadData.phone_number, leadData.phoneNumber, payload.phone, payload.phone_number, payload.callerNumber, payload.caller_number),
    email: pick(leadData.email, payload.email),
    requirement: pick(leadData.requirement, leadData.message, leadData.intent, payload.requirement, payload.summary),
    preferredDate: pick(leadData.preferred_date, leadData.preferredDate, payload.preferred_date, payload.preferredDate),
    preferredTime: pick(leadData.preferred_time, leadData.preferredTime, payload.preferred_time, payload.preferredTime),
    budget: pick(leadData.budget, payload.budget),
    location: pick(leadData.location, payload.location),
    message: pick(leadData.message, payload.message),
    customFields: leadData.customFields || leadData.custom_fields || leadData
  };
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

function extractRealtimeLeadData(events = []) {
  if (!Array.isArray(events)) return null;

  for (const event of events) {
    const type = String(event?.type || "").toLowerCase();
    const payload = event?.payload || event?.data || event;
    const variables =
      payload?.variables ||
      payload?.extracted_variables ||
      payload?.extractedVariables ||
      payload?.leadData ||
      payload?.lead_data;

    if (type.includes("extraction") && variables) {
      return variables;
    }
  }

  return null;
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
