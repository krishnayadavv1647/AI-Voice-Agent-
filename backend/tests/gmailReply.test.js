import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildReplyRecipients,
  buildReplySubject,
  buildReplyThreadingHeaders
} from "../src/services/gmail/gmailReply.util.js";

const inboundMessage = {
  from: [{ email: "jane@example.com", name: "Jane" }],
  to: [{ email: "me@gmail.com" }, { email: "bob@x.com" }],
  cc: [{ email: "cara@x.com" }],
  internetMessageId: "<abc@mail>",
  references: ["<r1@mail>"]
};

test("reply targets only the original sender", () => {
  const { to, cc } = buildReplyRecipients({ mode: "reply", message: inboundMessage, connectedEmail: "me@gmail.com" });
  assert.deepEqual(to.map((a) => a.email), ["jane@example.com"]);
  assert.deepEqual(cc, []);
});

test("reply_all includes original To/Cc and excludes the connected address", () => {
  const { to, cc } = buildReplyRecipients({ mode: "reply_all", message: inboundMessage, connectedEmail: "me@gmail.com" });
  assert.deepEqual(to.map((a) => a.email), ["jane@example.com"]);
  const ccEmails = cc.map((a) => a.email).sort();
  assert.deepEqual(ccEmails, ["bob@x.com", "cara@x.com"]);
  assert.ok(!ccEmails.includes("me@gmail.com"), "connected address must be excluded");
});

test("reply_all deduplicates and never includes bcc", () => {
  const message = {
    from: [{ email: "jane@example.com" }],
    to: [{ email: "jane@example.com" }, { email: "me@gmail.com" }],
    cc: [{ email: "jane@example.com" }],
    bcc: [{ email: "secret@x.com" }]
  };
  const { to, cc } = buildReplyRecipients({ mode: "reply_all", message, connectedEmail: "me@gmail.com" });
  const all = [...to, ...cc].map((a) => a.email);
  assert.ok(!all.includes("secret@x.com"), "bcc must never be copied");
  // jane appears once total across to+cc
  assert.equal(all.filter((e) => e === "jane@example.com").length, 1);
});

test("replying to our own sent message targets the original recipients", () => {
  const outbound = {
    from: [{ email: "me@gmail.com" }],
    to: [{ email: "client@x.com" }]
  };
  const { to } = buildReplyRecipients({ mode: "reply", message: outbound, connectedEmail: "me@gmail.com" });
  assert.deepEqual(to.map((a) => a.email), ["client@x.com"]);
});

test("buildReplySubject adds Re: once", () => {
  assert.equal(buildReplySubject("Proposal"), "Re: Proposal");
  assert.equal(buildReplySubject("Re: Proposal"), "Re: Proposal");
  assert.equal(buildReplySubject("RE: Proposal"), "RE: Proposal");
});

test("buildReplyThreadingHeaders appends the replied message id to references", () => {
  const { inReplyTo, references } = buildReplyThreadingHeaders(inboundMessage);
  assert.equal(inReplyTo, "<abc@mail>");
  assert.deepEqual(references, ["<r1@mail>", "<abc@mail>"]);
});
