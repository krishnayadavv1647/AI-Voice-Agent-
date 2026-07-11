import crypto from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

// Deterministic secrets for signing + token encryption in tests.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-value";
process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY = process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY || "test-encryption-key-at-least-32bytes!!";

const { signGmailState, verifyGmailState, persistRefreshedTokens } = await import("../src/services/gmail/gmailOAuth.service.js");
const { decryptCredential } = await import("../src/services/credentialEncryptionService.js");
const EmailIntegration = (await import("../src/models/EmailIntegration.js")).default;

const VALID_USER_ID = "507f1f77bcf86cd799439011";

test("a freshly signed Gmail OAuth state verifies and returns the userId", () => {
  const state = signGmailState(VALID_USER_ID);
  const parsed = verifyGmailState(state);
  assert.ok(parsed);
  assert.equal(parsed.userId, VALID_USER_ID);
});

test("a tampered Gmail OAuth state fails verification", () => {
  const state = signGmailState(VALID_USER_ID);
  const [payload] = state.split(".");
  const forged = `${payload}.${"0".repeat(43)}`;
  assert.equal(verifyGmailState(forged), null);
});

test("an expired Gmail OAuth state fails verification", () => {
  // Hand-build a state whose timestamp is 20 minutes old (max age is 10 minutes).
  const payload = Buffer.from(JSON.stringify({ userId: VALID_USER_ID, nonce: "n", ts: Date.now() - 20 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.JWT_SECRET).update(payload).digest("base64url");
  assert.equal(verifyGmailState(`${payload}.${signature}`), null);
});

test("a state with a non-ObjectId userId fails verification", () => {
  const payload = Buffer.from(JSON.stringify({ userId: "not-an-id", nonce: "n", ts: Date.now() })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.JWT_SECRET).update(payload).digest("base64url");
  assert.equal(verifyGmailState(`${payload}.${signature}`), null);
});

test("persistRefreshedTokens encrypts the access token and never persists it in plain text", async (t) => {
  let captured = null;
  t.mock.method(EmailIntegration, "updateOne", async (_query, update) => { captured = update; });

  await persistRefreshedTokens("integration-1", { access_token: "ya29.SECRET", expiry_date: Date.now() + 3600000 });

  assert.ok(captured.$set["gmail.accessTokenEncrypted"]);
  assert.notEqual(captured.$set["gmail.accessTokenEncrypted"], "ya29.SECRET");
  assert.equal(decryptCredential(captured.$set["gmail.accessTokenEncrypted"]), "ya29.SECRET");
});

test("persistRefreshedTokens preserves an existing refresh token when Google returns none", async (t) => {
  let captured = null;
  t.mock.method(EmailIntegration, "updateOne", async (_query, update) => { captured = update; });

  // Google omits refresh_token on a normal access-token refresh.
  await persistRefreshedTokens("integration-1", { access_token: "ya29.NEW", expiry_date: Date.now() + 3600000 });

  assert.ok(captured.$set["gmail.accessTokenEncrypted"]);
  assert.equal(captured.$set["gmail.refreshTokenEncrypted"], undefined, "must not overwrite the stored refresh token");
});
