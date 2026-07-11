import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRawGmailMessage, toBase64Url } from "../src/services/gmail/gmailMime.service.js";
import { decodeBase64Url } from "../src/services/gmail/gmailParser.service.js";

test("toBase64Url produces URL-safe output with no +, / or =", () => {
  const raw = toBase64Url(Buffer.from("padding???"));
  assert.ok(!/[+/=]/.test(raw));
});

test("buildRawGmailMessage compiles a base64url MIME message", async () => {
  const raw = await buildRawGmailMessage({
    from: { email: "me@gmail.com" },
    to: [{ email: "customer@example.com" }],
    subject: "Hello",
    text: "Body text"
  });
  assert.ok(!/[+/=]/.test(raw), "must be base64url");
  const mime = decodeBase64Url(raw);
  assert.ok(/To: customer@example.com/.test(mime));
  assert.ok(/Subject: Hello/.test(mime));
  assert.ok(/Body text/.test(mime));
});

test("buildRawGmailMessage includes In-Reply-To and References headers", async () => {
  const raw = await buildRawGmailMessage({
    from: { email: "me@gmail.com" },
    to: [{ email: "c@x.com" }],
    subject: "Re: Proposal",
    text: "reply",
    inReplyTo: "<prev@mail>",
    references: ["<r1@mail>", "<prev@mail>"]
  });
  const mime = decodeBase64Url(raw);
  assert.ok(/In-Reply-To: <prev@mail>/.test(mime));
  assert.ok(/References: <r1@mail> <prev@mail>/.test(mime));
});

test("buildRawGmailMessage prevents header injection via subject newlines", async () => {
  const raw = await buildRawGmailMessage({
    from: { email: "me@gmail.com" },
    to: [{ email: "c@x.com" }],
    subject: "Hi\r\nBcc: victim@evil.com",
    text: "body"
  });
  const mime = decodeBase64Url(raw);
  // The injected Bcc header must NOT appear as its own header line.
  assert.ok(!/^Bcc: victim@evil.com/m.test(mime));
});
