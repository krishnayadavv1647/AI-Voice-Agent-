import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeBase64Url,
  getHeader,
  parseAddressHeader,
  parseGmailMessage
} from "../src/services/gmail/gmailParser.service.js";

const b64url = (s) => Buffer.from(s).toString("base64url");

function headers(pairs) {
  return Object.entries(pairs).map(([name, value]) => ({ name, value }));
}

test("decodeBase64Url decodes URL-safe base64", () => {
  assert.equal(decodeBase64Url(b64url("Hello, world")), "Hello, world");
});

test("parseAddressHeader handles quoted names and multiple addresses", () => {
  const parsed = parseAddressHeader('"Doe, John" <john@example.com>, jane@example.com');
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], { name: "Doe, John", email: "john@example.com" });
  assert.equal(parsed[1].email, "jane@example.com");
});

test("parser extracts plain text body", () => {
  const message = {
    id: "m1", threadId: "t1", labelIds: ["INBOX"],
    payload: { mimeType: "text/plain", headers: headers({ From: "a@x.com", Subject: "Hi" }), body: { data: b64url("just text") } }
  };
  const parsed = parseGmailMessage(message);
  assert.equal(parsed.textBody, "just text");
  assert.equal(parsed.htmlBody, "");
  assert.equal(parsed.subject, "Hi");
});

test("parser extracts HTML body", () => {
  const message = {
    id: "m2", threadId: "t2", labelIds: ["INBOX"],
    payload: { mimeType: "text/html", headers: headers({ From: "a@x.com" }), body: { data: b64url("<p>Rich <b>body</b></p>") } }
  };
  const parsed = parseGmailMessage(message);
  assert.ok(parsed.htmlBody.includes("<b>body</b>"));
  // Text fallback is derived from the HTML.
  assert.ok(parsed.textBody.includes("body"));
});

test("parser handles nested multipart/mixed with attachment metadata", () => {
  const message = {
    id: "m3", threadId: "t3", labelIds: ["INBOX"],
    payload: {
      mimeType: "multipart/mixed",
      headers: headers({ From: "a@x.com", Subject: "With file" }),
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: b64url("plain part") } },
            { mimeType: "text/html", body: { data: b64url("<p>html part</p>") } }
          ]
        },
        {
          mimeType: "application/pdf",
          filename: "report.pdf",
          body: { attachmentId: "att-123", size: 2048 },
          headers: headers({ "Content-Disposition": "attachment; filename=report.pdf" })
        }
      ]
    }
  };
  const parsed = parseGmailMessage(message);
  assert.equal(parsed.textBody, "plain part");
  assert.ok(parsed.htmlBody.includes("html part"));
  assert.equal(parsed.hasAttachments, true);
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0].attachmentId, "att-123");
  assert.equal(parsed.attachments[0].filename, "report.pdf");
});

test("parser extracts Message-ID, In-Reply-To and References", () => {
  const message = {
    id: "m4", threadId: "t4", labelIds: ["INBOX"],
    payload: {
      mimeType: "text/plain",
      headers: headers({
        From: "a@x.com",
        "Message-ID": "<msg-4@mail>",
        "In-Reply-To": "<msg-3@mail>",
        References: "<msg-1@mail> <msg-2@mail> <msg-3@mail>"
      }),
      body: { data: b64url("reply") }
    }
  };
  const parsed = parseGmailMessage(message);
  assert.equal(parsed.internetMessageId, "<msg-4@mail>");
  assert.equal(parsed.inReplyTo, "<msg-3@mail>");
  assert.deepEqual(parsed.references, ["<msg-1@mail>", "<msg-2@mail>", "<msg-3@mail>"]);
});

test("parser marks SENT label as outbound and connected-address sender as outbound", () => {
  const sent = {
    id: "m5", threadId: "t5", labelIds: ["SENT"],
    payload: { mimeType: "text/plain", headers: headers({ From: "me@gmail.com", To: "cust@x.com" }), body: { data: b64url("hi") } }
  };
  assert.equal(parseGmailMessage(sent, { connectedEmail: "me@gmail.com" }).direction, "outbound");

  const inbound = {
    id: "m6", threadId: "t6", labelIds: ["INBOX", "UNREAD"],
    payload: { mimeType: "text/plain", headers: headers({ From: "cust@x.com", To: "me@gmail.com" }), body: { data: b64url("hi") } }
  };
  const parsedInbound = parseGmailMessage(inbound, { connectedEmail: "me@gmail.com" });
  assert.equal(parsedInbound.direction, "inbound");
  assert.equal(parsedInbound.isUnread, true);
});

test("getHeader is case-insensitive", () => {
  const h = headers({ "message-id": "<x@y>" });
  assert.equal(getHeader(h, "Message-ID"), "<x@y>");
});
