import { ApiError } from "../utils/apiError.js";
import {
  createAssistant,
  createOutboundCall,
  deleteAssistant,
  endCall as endVapiCall,
  updateAssistant
} from "../services/vapi.service.js";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasVapiAssistant(agent) {
  return Boolean(agent.providerAgentId && String(agent.providerAgentId).trim());
}

// Resolve the Vapi phone-number id: per-agent config first (agent.vapiPhoneNumberId), then the
// optional VAPI_PHONE_NUMBER_ID env fallback. Vapi requires a UUID here, not the E.164 number.
function resolveVapiPhoneNumberId(agent) {
  const id = String(agent.vapiPhoneNumberId || process.env.VAPI_PHONE_NUMBER_ID || "").trim();

  if (!id) {
    throw new ApiError(
      400,
      "Vapi phone number is not configured for this agent. Import your number in the Vapi dashboard and set the agent's Vapi phone number id (a UUID)."
    );
  }

  if (!UUID_PATTERN.test(id)) {
    throw new ApiError(
      400,
      "Vapi phone number id must be the UUID from the Vapi dashboard, not a phone number. Import your Twilio number into Vapi and use the number's id."
    );
  }

  return id;
}

export const VapiProvider = {
  async create(agent) {
    if (hasVapiAssistant(agent)) {
      console.log("[Provider Sync]", {
        agentId: agent._id.toString(),
        provider: "vapi",
        providerAgentId: agent.providerAgentId,
        action: "create",
        externalAssistantCreated: false
      });

      return {
        provider: "vapi",
        providerAgentId: agent.providerAgentId,
        providerWorkflowId: agent.providerAgentId,
        status: "already_exists"
      };
    }

    console.log("[Provider Sync]", {
      agentId: agent._id.toString(),
      provider: "vapi",
      providerAgentId: null,
      action: "create",
      externalAssistantCreated: true
    });

    const raw = await createAssistant(agent);
    const id = raw?.id;

    if (!id) {
      throw new ApiError(502, "Vapi assistant was created but no id was returned.");
    }

    return {
      provider: "vapi",
      providerAgentId: id,
      providerWorkflowId: id,
      status: "created",
      raw
    };
  },

  async update(agent) {
    if (!hasVapiAssistant(agent)) {
      return VapiProvider.create(agent);
    }

    console.log("[Provider Sync]", {
      agentId: agent._id.toString(),
      provider: "vapi",
      providerAgentId: agent.providerAgentId,
      action: "update",
      externalAssistantCreated: false
    });

    const raw = await updateAssistant(agent.providerAgentId, agent);
    const id = raw?.id || agent.providerAgentId;

    return {
      provider: "vapi",
      providerAgentId: id,
      providerWorkflowId: id,
      status: "updated",
      raw
    };
  },

  async archive(agent) {
    if (!hasVapiAssistant(agent)) {
      return {
        provider: "vapi",
        providerAgentId: null,
        status: "archive_skipped_no_assistant"
      };
    }

    console.log("[Provider Sync]", {
      agentId: agent._id.toString(),
      provider: "vapi",
      providerAgentId: agent.providerAgentId,
      action: "archive",
      externalAssistantCreated: false
    });

    const raw = await deleteAssistant(agent.providerAgentId);

    return {
      provider: "vapi",
      providerAgentId: agent.providerAgentId,
      status: "archived",
      raw
    };
  },

  async startCall(agent, payload = {}) {
    const phoneNumber = payload.phoneNumber;

    if (!phoneNumber || !E164_PATTERN.test(phoneNumber)) {
      throw new ApiError(
        400,
        "Phone number must be in E.164 format, for example +17578297060"
      );
    }

    if (!hasVapiAssistant(agent)) {
      throw new ApiError(400, "Vapi assistant is not created yet for this agent.");
    }

    const phoneNumberId = resolveVapiPhoneNumberId(agent);

    const raw = await createOutboundCall({
      agent,
      phoneNumber,
      phoneNumberId,
      metadata: payload.metadata
    });

    return {
      provider: "vapi",
      providerCallId: raw?.id,
      status: "call_started",
      raw
    };
  },

  async endCall(agent, payload = {}) {
    const callId = payload.providerCallId || payload.callId;

    if (!callId) {
      return {
        provider: "vapi",
        status: "end_call_noop"
      };
    }

    const raw = await endVapiCall(callId);

    return {
      provider: "vapi",
      status: "call_ended",
      raw
    };
  }
};
