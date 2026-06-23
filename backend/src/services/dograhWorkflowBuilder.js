import { ApiError } from "../utils/apiError.js";

function hasText(value) {
  return Boolean(value && String(value).trim());
}

function value(input) {
  return hasText(input) ? String(input).trim() : "Not provided";
}

function firstSpokenMessage(agent) {
  return (
    [agent.firstMessage, agent.greetingMessage]
      .find((item) => hasText(item)) ||
    `Hello, welcome to ${value(agent.businessName)}. How can I help you today?`
  );
}

function formatLeadQuestions(leadQuestions = []) {
  if (!Array.isArray(leadQuestions) || !leadQuestions.length) {
    return "Not provided";
  }

  return leadQuestions
    .map((question) => {
      const required = question.required ? "required" : "optional";
      return `- ${question.label || question.fieldName || "Lead detail"} (${question.fieldName || "field"}; ${required})`;
    })
    .join("\n");
}

function isBusTicketBusiness(agent) {
  const text = `${agent.businessCategory || ""} ${agent.businessDescription || ""}`.toLowerCase();
  return (
    text.includes("bus") ||
    text.includes("ticket") ||
    text.includes("travel") ||
    text.includes("transport")
  );
}

function isHealthcareBusiness(agent) {
  const text = `${agent.businessCategory || ""} ${agent.businessDescription || ""}`.toLowerCase();
  return (
    text.includes("hospital") ||
    text.includes("clinic") ||
    text.includes("health") ||
    text.includes("medical")
  );
}

function buildPronunciationRules(agent) {
  return `
Voice Pronunciation Rules:
- Use English text only for voice output.
- Keep pronunciation clear, natural, and professional.
- Speak business names, customer names, phone numbers, dates, and times clearly.
- Keep sentences short and easy to understand.
- Ask one question at a time.

Example English replies:
- Hello, welcome to ${value(agent.businessName)}. How can I help you today?
- Sure, how many guests should I book for?
- Which date would you prefer for the booking?
- What time would you like?
- May I have your name?
- May I have your phone number?
- Our team will check and confirm.
`;
}

function buildBusTicketRules(agent) {
  if (!isBusTicketBusiness(agent)) return "";

  return `
Bus ticket booking rules:
- Help callers with bus ticket booking requests.
- Ask for source city first.
- Ask for destination city.
- Ask for travel date.
- Ask for number of passengers.
- Ask for preferred bus type: AC, non-AC, sleeper, semi-sleeper, seater, luxury.
- Ask for preferred travel timing.
- Help with boarding point and dropping point questions.
- Explain that fare depends on route, date, bus type, operator, and seat availability.
- Do not confirm ticket unless booking confirmation is available.
- Say "booking request" instead of "ticket confirmed" unless confirmation/payment is complete.
- If availability or fare is unknown, say the team will check and confirm.
- Collect name and phone number for follow-up.
- Do not talk about hospital, doctor, clinic, medicine, appointment, or medical topics unless the business category is healthcare.
`;
}

function buildHealthcareRules(agent) {
  if (!isHealthcareBusiness(agent)) return "";

  return `
Healthcare safety rules:
- Do not provide medical diagnosis.
- Do not suggest medicines.
- Do not suggest treatment.
- Do not interpret reports.
- For emergencies, advise caller to visit hospital immediately or contact emergency services.
`;
}

export function buildAgentPrompt(agent) {
  return `
You are ${value(agent.agentName)}, an AI voice agent for ${value(agent.businessName)}.

Agent Name:
${value(agent.agentName)}

Business Name:
${value(agent.businessName)}

Business Category:
${value(agent.businessCategory)}

Business Description:
${value(agent.businessDescription)}

Main Goal:
${value(agent.mainGoal)}

Secondary Goal:
${value(agent.secondaryGoal)}

Services:
${value(agent.services)}

Pricing:
${value(agent.pricing)}

FAQs:
${value(agent.faqs)}

Policies:
${value(agent.policies)}

Offers:
${value(agent.offers)}

Additional Information:
${value(agent.additionalInfo)}

Fallback Message:
${value(agent.fallbackMessage)}

Ending Message:
${value(agent.endingMessage)}

Human Transfer Message:
${value(agent.humanTransferMessage)}

Lead Questions:
${formatLeadQuestions(agent.leadQuestions)}

Existing System Prompt:
${value(agent.systemPrompt)}

Conversation Rules:
- Speak naturally and professionally.
- Keep responses short and useful.
- Ask one question at a time.
- Answer only from the business details above.
- Do not invent services, prices, policies, availability, or confirmations.
- If information is missing, use the fallback message and say the team will check and confirm.
- If the caller asks for human help, use the human transfer message.
- If the caller is interested in an appointment, ask for preferred date and time, then collect name, phone, and purpose.
- After collecting appointment details, say: "I have noted your appointment request for [date and time]. Our team will confirm it shortly."
- Do not say the booking failed, do not mention a technical issue, and do not apologize for being unable to book.
- Do not claim a final confirmed appointment unless explicit confirmation is available in the current call context.
- Before ending, summarize the caller's request and collected details.
- End with the ending message when the request is complete.
- Collect lead details according to the lead questions when the caller wants booking, support, callback, purchase, or follow-up.

${buildHealthcareRules(agent)}

${buildBusTicketRules(agent)}

${buildPronunciationRules(agent)}

Stay strictly within this business category. Do not switch to another business type. If the business is bus ticket booking, only talk about bus routes, tickets, travel, passengers, fares, seats, boarding, dropping, cancellation, refund, and booking support.
`;
}

function buildGlobalPrompt() {
  return `
- Speak politely and professionally.
- Keep answers short.
- Ask one question at a time.
- Do not repeat intro again and again.
- Stay focused on the business.
- Do not make fake promises.
- If user wants appointment/callback, collect name, phone number, and requirement.
- Use English text only for all voice responses and pronunciation examples.
`;
}

function dograhExtractionEnabled() {
  return process.env.DOGRAH_ENABLE_EXTRACTION !== "false";
}

function buildExtractionData() {
  if (!dograhExtractionEnabled()) {
    return {
      extraction_enabled: false
    };
  }

  return {
    extraction_enabled: true,
    extraction_prompt: "Extract lead details from the call if the caller provides them. Only extract information that was actually mentioned. Do not invent missing details. Return all structured lead data in English only. Transliterate Hindi names, translate requirements, and convert date/time into English format. Never return Hindi text in CRM fields.",
    extraction_variables: [
      { name: "customer_name", type: "string", prompt: "Customer name if mentioned. Return in English only; transliterate Hindi names." },
      { name: "phone_number", type: "string", prompt: "Customer phone number if mentioned" },
      { name: "requirement", type: "string", prompt: "Main customer requirement or intent. Return in English only; translate Hindi or Hinglish requirements." },
      { name: "number_of_guests", type: "string", prompt: "Number of guests for restaurant booking if mentioned" },
      { name: "booking_date", type: "string", prompt: "Preferred booking date if mentioned. Return in English readable format." },
      { name: "booking_time", type: "string", prompt: "Preferred booking time if mentioned. Return in English readable format." },
      { name: "special_request", type: "string", prompt: "Any special request if mentioned. Return in English only." }
    ]
  };
}

export function buildDograhWorkflowDefinition(agent) {
  if (!agent?._id) throw new ApiError(400, "Agent must be saved before building Dograh workflow definition.");

  const localId = agent._id.toString();
  const globalNodeId = `global-${localId}`;
  const startNodeId = `start-${localId}`;
  const agentNodeId = `agent-${localId}`;
  const endNodeId = `end-${localId}`;

  const globalPrompt = buildGlobalPrompt(agent);
  const startPrompt = firstSpokenMessage(agent);
  const agentPrompt = buildAgentPrompt(agent);
  console.log("AUTO DOGRAH AGENT PROMPT:", agentPrompt);
  const endPrompt = "Thank the caller and end the call politely after the request is handled or callback details are collected.";

  return {
    nodes: [
      {
        id: globalNodeId,
        type: "globalNode",
        position: { x: -350, y: 0 },
        data: {
          name: "Global Rules",
          prompt: globalPrompt
        }
      },
      {
        id: startNodeId,
        type: "startCall",
        position: { x: 0, y: 0 },
        data: {
          name: "Start Call",
          prompt: startPrompt
        }
      },
      {
        id: agentNodeId,
        type: "agentNode",
        position: { x: 350, y: 0 },
        data: {
          name: agent.agentName || "Main Agent",
          prompt: agentPrompt,
          add_global_prompt: true,
          allow_interrupt: agent.allowInterruption !== false,
          wait_for_user_response: true,
          ...(agent.leadCaptureEnabled === false ? { extraction_enabled: false } : buildExtractionData())
        }
      },
      {
        id: endNodeId,
        type: "endCall",
        position: { x: 700, y: 0 },
        data: {
          name: "End Call",
          prompt: endPrompt
        }
      }
    ],
    edges: [
      {
        id: `edge-start-agent-${localId}`,
        source: startNodeId,
        target: agentNodeId,
        data: {
          label: "Move to Main Agent",
          condition: "After greeting the caller, move to the main agent."
        }
      },
      {
        id: `edge-agent-end-${localId}`,
        source: agentNodeId,
        target: endNodeId,
        data: {
          label: "End Call",
          condition: "The caller's request is handled, callback details are collected, or the caller wants to end the call."
        }
      }
    ]
  };
}

export function validateLocalWorkflowDefinition(workflowDefinition) {
  if (!Array.isArray(workflowDefinition?.nodes)) throw new ApiError(400, "Dograh workflow nodes must be an array.");
  if (!Array.isArray(workflowDefinition?.edges)) throw new ApiError(400, "Dograh workflow edges must be an array.");

  const nodes = workflowDefinition.nodes;
  const edges = workflowDefinition.edges;
  const nodeIds = new Set(nodes.map((node) => node.id));

  if (nodeIds.size !== nodes.length) throw new ApiError(400, "Dograh workflow node IDs must be unique.");
  if (nodes.filter((node) => node.type === "startCall").length !== 1) throw new ApiError(400, "Dograh workflow must include exactly one startCall node.");
  if (nodes.filter((node) => node.type === "agentNode").length !== 1) throw new ApiError(400, "Dograh workflow must include exactly one agentNode node.");
  if (nodes.filter((node) => node.type === "endCall").length !== 1) throw new ApiError(400, "Dograh workflow must include exactly one endCall node.");

  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) throw new ApiError(400, `Dograh workflow edge source does not exist: ${edge.source}`);
    if (!nodeIds.has(edge.target)) throw new ApiError(400, `Dograh workflow edge target does not exist: ${edge.target}`);
  }

  const agentNode = nodes.find((node) => node.type === "agentNode");
  const startNode = nodes.find((node) => node.type === "startCall");
  const endNode = nodes.find((node) => node.type === "endCall");

  if (!edges.some((edge) => edge.target === agentNode.id)) throw new ApiError(400, "Dograh agentNode must have at least one incoming edge.");
  if (!edges.some((edge) => edge.source === startNode.id && edge.target === agentNode.id)) throw new ApiError(400, "Dograh startCall must connect to agentNode.");
  if (!edges.some((edge) => edge.source === agentNode.id && edge.target === endNode.id)) throw new ApiError(400, "Dograh agentNode must connect to endCall.");

  for (const node of nodes) {
    if ((node.type === "globalNode" || node.type === "startCall" || node.type === "agentNode" || node.type === "endCall") && !hasText(node.data?.prompt)) {
      throw new ApiError(400, `Dograh ${node.type} prompt is required.`);
    }
  }
}
