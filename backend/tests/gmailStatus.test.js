import assert from "node:assert/strict";
import { test } from "node:test";

import { toSafeIntegrationStatus } from "../src/services/emailIntegrationStatus.service.js";

function fakeIntegration(overrides = {}) {
  return {
    brevo: {},
    inbound: {},
    gmail: {
      email: "user@gmail.com",
      displayName: "User Name",
      connected: true,
      syncEnabled: true,
      syncStatus: "idle",
      gmailInitialSyncComplete: true,
      gmailNextPageToken: "next-token",
      grantedScopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.modify"],
      accessTokenEncrypted: "v1:enc:enc:enc",
      refreshTokenEncrypted: "v1:enc:enc:enc",
      ...overrides
    }
  };
}

test("Gmail status never exposes access or refresh tokens", () => {
  const status = toSafeIntegrationStatus(fakeIntegration());
  const serialized = JSON.stringify(status);
  assert.ok(!serialized.includes("accessTokenEncrypted"));
  assert.ok(!serialized.includes("refreshTokenEncrypted"));
  assert.equal(status.gmail.accessTokenEncrypted, undefined);
  assert.equal(status.gmail.refreshTokenEncrypted, undefined);
});

test("Gmail status reports connected send/receive capability", () => {
  const status = toSafeIntegrationStatus(fakeIntegration());
  assert.equal(status.gmail.connected, true);
  assert.equal(status.gmail.email, "user@gmail.com");
  assert.equal(status.gmail.canSend, true);
  assert.equal(status.gmail.canRead, true);
  assert.equal(status.gmail.hasMore, true);
  assert.equal(status.gmail.initialSyncComplete, true);
  assert.equal(status.setup.canSend, true);
  assert.equal(status.setup.fullyConfigured, true);
});

test("Gmail canSend is false without the gmail.modify scope", () => {
  const status = toSafeIntegrationStatus(fakeIntegration({ grantedScopes: ["openid", "email"] }));
  assert.equal(status.gmail.canSend, false);
  assert.equal(status.setup.fullyConfigured, false);
});

test("disconnected Gmail reports not connected", () => {
  const status = toSafeIntegrationStatus(fakeIntegration({ connected: false }));
  assert.equal(status.gmail.connected, false);
  assert.equal(status.gmail.canSend, false);
});
