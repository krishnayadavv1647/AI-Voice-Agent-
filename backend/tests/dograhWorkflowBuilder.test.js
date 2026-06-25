import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDograhWorkflowDefinition } from "../src/services/dograhWorkflowBuilder.js";

test("Dograh workflow includes opening speech fields and does not end immediately after pickup", () => {
  const workflow = buildDograhWorkflowDefinition({
    _id: "agent_1",
    agentName: "Review Agent",
    businessName: "Neugo bus electric",
    businessCategory: "Call Center",
    firstMessage: "Hello, this is Review Agent. How can I help you today?",
    leadCaptureEnabled: true
  });

  const startNode = workflow.nodes.find((node) => node.type === "startCall");
  const agentNode = workflow.nodes.find((node) => node.type === "agentNode");
  const endNode = workflow.nodes.find((node) => node.type === "endCall");
  const outgoingAgentEdges = workflow.edges.filter((edge) => edge.source === agentNode.id);

  assert.equal(startNode.data.prompt, "Hello, this is Review Agent. How can I help you today?");
  assert.equal(startNode.data.first_message, startNode.data.prompt);
  assert.equal(startNode.data.wait_for_user_response, false);
  assert.equal(startNode.data.speak_first, true);
  assert.equal(startNode.data.agent_speaks_first, true);
  assert.equal(startNode.data.initial_speaker, "agent");
  assert.equal(agentNode.data.first_message, startNode.data.prompt);
  assert.equal(agentNode.data.wait_for_user_response, false);
  assert.equal(agentNode.data.speak_first, true);
  assert.equal(agentNode.data.agent_speaks_first, true);
  assert.match(agentNode.data.prompt, /immediately say the opening line/i);
  assert.equal(endNode, undefined);
  assert.deepEqual(outgoingAgentEdges, []);
});
