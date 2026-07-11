import crypto from "crypto";
import { google } from "googleapis";
import EmailIntegration from "../../models/EmailIntegration.js";
import { ApiError } from "../../utils/apiError.js";
import { decryptCredential, encryptCredential } from "../credentialEncryptionService.js";
import { classifyGmailError, isGmailAuthError } from "./gmailErrors.js";

// gmail.modify covers read + send + label changes (mark read, star, archive, trash).
// openid/email/profile identify the connected account without a second login flow.
export const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify"
];

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function isGmailOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_GMAIL_REDIRECT_URI
  );
}

export function assertGmailOAuthConfigured() {
  if (!isGmailOAuthConfigured()) {
    throw new ApiError(500, "Gmail OAuth is not configured on the server.");
  }
  if (!process.env.JWT_SECRET) {
    throw new ApiError(500, "JWT_SECRET is missing in backend environment.");
  }
}

// Reuses the existing Google OAuth client credentials but a SEPARATE Gmail callback URI, so the
// application-login flow (/api/auth/google/callback) is never touched.
export function createGmailOAuthClient() {
  assertGmailOAuthConfigured();
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_GMAIL_REDIRECT_URI
  );
}

// --- Signed OAuth state (HMAC over base64url(payload)). Prevents CSRF and forged userIds. ---
export function signGmailState(userId, nonce = crypto.randomBytes(16).toString("hex")) {
  if (!process.env.JWT_SECRET) throw new ApiError(500, "JWT_SECRET is missing in backend environment.");
  const payload = Buffer.from(JSON.stringify({ userId: String(userId), nonce, ts: Date.now() })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.JWT_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyGmailState(state) {
  try {
    const [payload, signature] = String(state || "").split(".");
    if (!payload || !signature || !process.env.JWT_SECRET) return null;
    const expected = crypto.createHmac("sha256", process.env.JWT_SECRET).update(payload).digest("base64url");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed?.userId || !/^[a-f\d]{24}$/i.test(String(parsed.userId))) return null;
    if (!Number.isFinite(Number(parsed.ts))) return null;
    if (Date.now() - Number(parsed.ts) > STATE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function generateGmailAuthorizationUrl({ userId }) {
  const client = createGmailOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GMAIL_SCOPES,
    state: signGmailState(userId)
  });
}

export async function exchangeGmailAuthorizationCode(code) {
  if (!code) throw new ApiError(400, "Missing Gmail authorization code.");
  const client = createGmailOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function getGmailProfile(gmailClient) {
  const { data } = await gmailClient.users.getProfile({ userId: "me" });
  return data;
}

// Builds a Gmail client from freshly exchanged tokens (used once during the callback to read the
// profile before the tokens are persisted).
export function createGmailClientFromTokens(tokens) {
  const client = createGmailOAuthClient();
  client.setCredentials(tokens);
  return google.gmail({ version: "v1", auth: client });
}

// Decodes the (already TLS-trusted) id_token payload to read `sub` and `name`. No signature
// verification is needed because the token came directly from Google's token endpoint.
export function decodeIdToken(idToken) {
  try {
    const payload = String(idToken || "").split(".")[1];
    if (!payload) return {};
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

// Persists only NEW token material. Google omits the refresh_token on re-consent when it hasn't
// rotated, so we keep the previously stored one instead of wiping it.
export async function persistRefreshedTokens(integrationId, tokens) {
  if (!integrationId || !tokens) return;
  const set = {};
  if (tokens.access_token) set["gmail.accessTokenEncrypted"] = encryptCredential(tokens.access_token);
  if (tokens.refresh_token) set["gmail.refreshTokenEncrypted"] = encryptCredential(tokens.refresh_token);
  if (tokens.expiry_date) set["gmail.tokenExpiresAt"] = new Date(tokens.expiry_date);
  if (!Object.keys(set).length) return;
  await EmailIntegration.updateOne({ _id: integrationId }, { $set: set }).catch(() => {});
}

// Builds an authorized Gmail client from stored (encrypted) tokens. googleapis auto-refreshes the
// access token using the refresh token; we listen for refreshes and persist them encrypted.
export function createAuthorizedGmailClient(integration) {
  const gmailState = integration?.gmail || {};
  const refreshToken = gmailState.refreshTokenEncrypted ? decryptCredential(gmailState.refreshTokenEncrypted) : "";
  const accessToken = gmailState.accessTokenEncrypted ? decryptCredential(gmailState.accessTokenEncrypted) : "";
  if (!refreshToken && !accessToken) {
    throw new ApiError(400, "Gmail is not connected.");
  }

  const oauth2Client = createGmailOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: refreshToken || undefined,
    access_token: accessToken || undefined,
    expiry_date: gmailState.tokenExpiresAt ? new Date(gmailState.tokenExpiresAt).getTime() : undefined
  });

  oauth2Client.on("tokens", (tokens) => {
    // Fire-and-forget; never blocks the API call that triggered the refresh.
    persistRefreshedTokens(integration._id, tokens);
    // Keep the in-memory doc roughly in sync for the rest of this request.
    if (tokens.access_token) integration.gmail.accessTokenEncrypted = encryptCredential(tokens.access_token);
    if (tokens.refresh_token) integration.gmail.refreshTokenEncrypted = encryptCredential(tokens.refresh_token);
    if (tokens.expiry_date) integration.gmail.tokenExpiresAt = new Date(tokens.expiry_date);
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  return { gmail, oauth2Client };
}

// Marks the integration disconnected ONLY for permanent auth failures (invalid_grant, revoked).
// Temporary Google outages must never disconnect a user.
export async function markGmailErrorState(integration, error) {
  const type = classifyGmailError(error);
  if (!integration?.gmail) return type;
  if (isGmailAuthError(error)) {
    integration.gmail.connected = false;
    integration.gmail.syncEnabled = false;
    integration.gmail.syncStatus = "error";
    integration.gmail.lastErrorType = "auth";
    integration.gmail.lastError = "Gmail authorization expired. Reconnect Gmail.";
  } else {
    integration.gmail.syncStatus = "error";
    integration.gmail.lastErrorType = type;
    integration.gmail.lastError = type === "rate_limit"
      ? "Gmail rate limit reached. Sync paused briefly."
      : "Gmail sync failed temporarily. Will retry.";
  }
  await integration.save().catch(() => {});
  return type;
}

export async function revokeGmailAuthorization(integration) {
  const gmailState = integration?.gmail || {};
  const token = gmailState.refreshTokenEncrypted
    ? decryptCredential(gmailState.refreshTokenEncrypted)
    : (gmailState.accessTokenEncrypted ? decryptCredential(gmailState.accessTokenEncrypted) : "");
  if (!token) return { revoked: false };
  try {
    const client = createGmailOAuthClient();
    await client.revokeToken(token);
    return { revoked: true };
  } catch {
    // Revocation failure (already revoked / network) must not block a local disconnect.
    return { revoked: false };
  }
}
