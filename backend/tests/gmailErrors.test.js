import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyGmailError,
  isGmailAuthError,
  isGmailHistoryExpired,
  isGmailRateLimitError,
  isGmailRetryable
} from "../src/services/gmail/gmailErrors.js";

test("invalid_grant is an auth error and never retryable", () => {
  const error = { response: { data: { error: "invalid_grant" } } };
  assert.equal(isGmailAuthError(error), true);
  assert.equal(classifyGmailError(error), "auth");
  assert.equal(isGmailRetryable(error), false);
});

test("HTTP 429 is a rate-limit error and retryable", () => {
  const error = { code: 429 };
  assert.equal(isGmailRateLimitError(error), true);
  assert.equal(classifyGmailError(error), "rate_limit");
  assert.equal(isGmailRetryable(error), true);
});

test("HTTP 5xx is temporary and retryable", () => {
  const error = { code: 503 };
  assert.equal(classifyGmailError(error), "temporary");
  assert.equal(isGmailRetryable(error), true);
});

test("HTTP 404 signals an expired history id", () => {
  assert.equal(isGmailHistoryExpired({ code: 404 }), true);
});

test("a 400 validation error is permanent and not retryable", () => {
  const error = { code: 400, errors: [{ reason: "invalidArgument" }] };
  assert.equal(classifyGmailError(error), "permanent");
  assert.equal(isGmailRetryable(error), false);
});

test("network resets are treated as temporary/retryable", () => {
  const error = { code: "ECONNRESET" };
  assert.equal(isGmailRetryable(error), true);
});
