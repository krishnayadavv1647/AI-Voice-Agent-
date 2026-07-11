import assert from "node:assert/strict";
import { test } from "node:test";

import EmailMessage from "../src/models/EmailMessage.js";
import EmailThread from "../src/models/EmailThread.js";
import { upsertGmailMessage } from "../src/services/gmail/gmailSync.service.js";

const b64url = (s) => Buffer.from(s).toString("base64url");

function gmailMessage() {
  return {
    id: "gmail-msg-1",
    threadId: "gmail-thread-1",
    labelIds: ["INBOX", "UNREAD"],
    internalDate: "1700000000000",
    snippet: "hello",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: "cust@x.com" },
        { name: "To", value: "me@gmail.com" },
        { name: "Subject", value: "Question" },
        { name: "Message-ID", value: "<g1@mail>" }
      ],
      body: { data: b64url("Body of the email") }
    }
  };
}

const integration = { _id: "int-1", userId: "user-1", gmail: { email: "me@gmail.com" } };

test("initial sync does not create a duplicate for an already-imported Gmail message", async (t) => {
  const existing = {
    threadId: "thread-1",
    direction: "inbound",
    isRead: false,
    isStarred: false,
    labelIds: ["INBOX", "UNREAD"],
    save: async () => {}
  };
  t.mock.method(EmailMessage, "findOne", async () => existing);
  t.mock.method(EmailMessage, "create", async () => { throw new Error("create must not be called for a duplicate"); });

  const result = await upsertGmailMessage(integration, gmailMessage());
  assert.equal(result.duplicate, true);
  assert.notEqual(result.imported, true);
});

test("a new Gmail message is imported and stored with provider 'gmail'", async (t) => {
  const fakeThread = {
    _id: "thread-1",
    threadHeaders: { providerThreadId: "gmail-thread-1" },
    labelIds: [],
    messagesCount: 0,
    save: async () => {}
  };
  let created = null;
  t.mock.method(EmailMessage, "findOne", async () => null);
  t.mock.method(EmailThread, "findOne", async () => fakeThread);
  t.mock.method(EmailMessage, "create", async (doc) => { created = doc; return { _id: "new-msg" }; });

  const result = await upsertGmailMessage(integration, gmailMessage());
  assert.equal(result.imported, true);
  assert.ok(created, "EmailMessage.create should be called");
  assert.equal(created.provider, "gmail");
  assert.equal(created.providerMessageId, "gmail-msg-1");
  assert.equal(created.direction, "inbound");
});
