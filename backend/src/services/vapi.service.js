import axios from "axios";

import { ApiError } from "../utils/apiError.js";

const DEFAULT_VAPI_BASE_URL = "https://api.vapi.ai";

function getVapiBaseUrl() {
  return (process.env.VAPI_BASE_URL?.trim() || DEFAULT_VAPI_BASE_URL).replace(/\/$/, "");
}

function getVapiPrivateKey() {
  return process.env.VAPI_PRIVATE_KEY?.trim();
}

export function getVapiClient() {
  const apiKey = getVapiPrivateKey();

  if (!apiKey) {
    throw new ApiError(500, "Vapi provider is not configured: VAPI_PRIVATE_KEY is missing.");
  }

  return axios.create({
    baseURL: getVapiBaseUrl(),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }
  });
}

function formatVapiErrorMessage(data, fallback) {
  const detail = data?.message || data?.error || data?.detail;

  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return JSON.stringify(detail);
  if (detail && typeof detail === "object") return "Vapi returned a structured error.";
  if (data) return "Vapi returned an error.";

  return fallback;
}

function handleVapiError(error, action) {
  console.error("Vapi API Error Status:", error.response?.status);
  console.error("Vapi API Error Message:", error.message);

  const statusCode = error.response?.status || 502;
  const realMessage = formatVapiErrorMessage(
    error.response?.data,
    error.message || "Vapi API call failed"
  );

  throw new ApiError(statusCode, realMessage, {
    success: false,
    vapiStatus: error.response?.status,
    vapiAction: action,
    userMessage: realMessage
  });
}

/**
 * Map an Agent document's TTS configuration onto a Vapi voice object.
 * The platform supports `elevenlabs` and `deepgram` TTS providers; anything
 * else (including the platform default) falls back to a safe default.
 */
export function mapVoice(agent) {
  const provider = (agent.ttsProvider || "").toLowerCase();
  const defaultVoiceId = process.env.VAPI_DEFAULT_VOICE_ID?.trim() || "burt";

  if (provider === "deepgram") {
    return {
      provider: "deepgram",
      voiceId: agent.voiceId || agent.ttsModel || defaultVoiceId
    };
  }

  // ElevenLabs (default): low-latency model + streaming optimization.
  return {
    provider: "11labs",
    voiceId: agent.voiceId || defaultVoiceId,
    model: "eleven_flash_v2_5",
    optimizeStreamingLatency: 3
  };
}

/**
 * Pure mapping from an Agent document to a Vapi assistant payload.
 * No network calls — unit-testable.
 */
// Resolve the custom-LLM base URL Vapi should call. Vapi appends "/chat/completions" itself, so the
// url must point at the /api/vapi mount. This normalizes common misconfigurations: a bare domain
// (missing /api/vapi) or an accidental trailing /chat/completions. Falls back to PUBLIC_BACKEND_URL.
export function resolveCustomLlmUrl() {
  let base = (process.env.VAPI_CUSTOM_LLM_URL?.trim() || process.env.PUBLIC_BACKEND_URL?.trim() || "")
    .replace(/\/+$/, "");
  if (!base) return "";
  base = base.replace(/\/chat\/completions$/, ""); // Vapi appends this itself; don't double it.
  return /\/api\/vapi$/.test(base) ? base : `${base}/api/vapi`;
}

export function buildAssistantConfig(agent) {
  const publicBackendUrl = process.env.PUBLIC_BACKEND_URL?.trim().replace(/\/$/, "") || "";

  const config = {
    name: agent.agentName,
    model: {
      provider: "custom-llm",
      url: resolveCustomLlmUrl(), // Vapi appends /chat/completions
      model: agent._id.toString() // routing key for the local engine (Layer B)
    },
    transcriber: {
      provider: "deepgram",
      model: agent.sttModel && agent.sttModel !== "" ? agent.sttModel : "nova-3",
      language: agent.sttLanguage || "en",
      endpointing: 200
    },
    startSpeakingPlan: {
      waitSeconds: 0.2,
      smartEndpointingPlan: { provider: "livekit" }
    },
    voice: mapVoice(agent),
    firstMessage:
      (agent.firstMessage && agent.firstMessage.trim()) ||
      (agent.greetingMessage && agent.greetingMessage.trim()) ||
      `Hello, welcome to ${agent.businessName || "our business"}. How can I help you today?`,
    server: {
      url: `${publicBackendUrl}/api/vapi/webhook`,
      secret: process.env.VAPI_WEBHOOK_SECRET?.trim() || undefined
    },
    metadata: {
      localAgentId: agent._id.toString(),
      userId: agent.userId.toString()
    }
  };

  return config;
}

export async function createAssistant(agent) {
  try {
    const client = getVapiClient();
    const response = await client.post("/assistant", buildAssistantConfig(agent));
    return response.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    handleVapiError(error, "create assistant");
  }
}

export async function updateAssistant(assistantId, agent) {
  try {
    const client = getVapiClient();
    const response = await client.patch(`/assistant/${assistantId}`, buildAssistantConfig(agent));
    return response.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    handleVapiError(error, "update assistant");
  }
}

// Fetch a Vapi assistant by id; returns null if Vapi no longer has it (404). Used to confirm a
// stale providerAgentId is really gone before recreating it.
export async function getAssistant(assistantId) {
  try {
    const client = getVapiClient();
    const response = await client.get(`/assistant/${assistantId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) return null;
    if (error instanceof ApiError) throw error;
    handleVapiError(error, "get assistant");
  }
}

export async function deleteAssistant(assistantId) {
  try {
    const client = getVapiClient();
    const response = await client.delete(`/assistant/${assistantId}`);
    return response.data;
  } catch (error) {
    // Tolerate an already-deleted assistant.
    if (error.response?.status === 404) {
      return { deleted: false, notFound: true };
    }
    if (error instanceof ApiError) throw error;
    handleVapiError(error, "delete assistant");
  }
}

export async function createOutboundCall({ agent, phoneNumber, phoneNumberId, metadata }) {
  try {
    const client = getVapiClient();
    const response = await client.post("/call", {
      // BYO Twilio number imported into Vapi (UUID). Resolved per-agent by the caller, with an
      // optional VAPI_PHONE_NUMBER_ID env fallback for backward compatibility.
      phoneNumberId: (phoneNumberId || process.env.VAPI_PHONE_NUMBER_ID)?.trim(),
      customer: { number: phoneNumber },
      assistantId: agent.providerAgentId,
      metadata: {
        localAgentId: agent._id.toString(),
        userId: agent.userId.toString(),
        ...(metadata || {})
      }
    });
    return response.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    handleVapiError(error, "create outbound call");
  }
}

// Look up an already-imported Vapi phone number by its E.164 number; returns its UUID or null.
export async function findVapiPhoneNumberByNumber(number) {
  try {
    const client = getVapiClient();
    const response = await client.get("/phone-number");
    const list = Array.isArray(response.data) ? response.data : (response.data?.results || []);
    const match = list.find((pn) => pn?.number === number);
    return match?.id || null;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    handleVapiError(error, "list phone numbers");
  }
}

// Import a BYO Twilio number into Vapi; returns the new Vapi phone-number UUID.
export async function importTwilioNumberToVapi({ number, twilioAccountSid, twilioAuthToken, name }) {
  try {
    const client = getVapiClient();
    const response = await client.post("/phone-number", {
      provider: "twilio",
      number,
      twilioAccountSid,
      twilioAuthToken,
      name: name || `Imported ${number}`
    });
    return response.data?.id || null;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    handleVapiError(error, "import twilio number");
  }
}

// Ensure a Vapi phone-number id exists for a Twilio number: reuse it if already imported, otherwise
// import it. Returns the Vapi phone-number UUID. This is what makes the id "auto-generate".
export async function ensureVapiPhoneNumber({ number, twilioAccountSid, twilioAuthToken, name }) {
  if (!number) {
    throw new ApiError(400, "A phone number is required to import into Vapi.");
  }

  const existing = await findVapiPhoneNumberByNumber(number);
  if (existing) return existing;

  if (!twilioAccountSid || !twilioAuthToken) {
    throw new ApiError(400, "Twilio Account SID and Auth Token are required to import the number into Vapi.");
  }

  const id = await importTwilioNumberToVapi({ number, twilioAccountSid, twilioAuthToken, name });
  if (!id) {
    throw new ApiError(502, "Vapi did not return a phone number id after import.");
  }
  return id;
}

// Fetch a Vapi call by id (used to manually pull/backfill a call's transcript + outcome).
export async function getVapiCall(callId) {
  try {
    const client = getVapiClient();
    const response = await client.get(`/call/${callId}`);
    return response.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    handleVapiError(error, "get call");
  }
}

// Shape a Vapi call object into the end-of-call-report `message` the webhook chain consumes, so a
// manual sync reuses the exact same finalization path as the live webhook.
export function buildEndOfCallMessageFromVapiCall(call = {}) {
  return {
    type: "end-of-call-report",
    endedReason: call.endedReason,
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    durationSeconds: call.durationSeconds,
    call: {
      id: call.id,
      type: call.type,
      assistantId: call.assistantId,
      metadata: call.metadata,
      customer: call.customer,
      phoneNumber: call.phoneNumber
    },
    artifact: {
      transcript: call.artifact?.transcript,
      recordingUrl: call.artifact?.recordingUrl,
      transcriptUrl: call.artifact?.transcriptUrl
    },
    analysis: {
      summary: call.analysis?.summary,
      structuredData: call.analysis?.structuredData
    }
  };
}

export async function endCall(callId) {
  try {
    const client = getVapiClient();
    // Ending a live call is a control update on the call resource.
    const response = await client.patch(`/call/${callId}`, { status: "ended" });
    return response.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    handleVapiError(error, "end call");
  }
}
