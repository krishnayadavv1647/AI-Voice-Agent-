import { fetchBrevoSenders, validateBrevoAccount } from "../services/brevoService.js";
import { decryptCredential, encryptCredential } from "../services/credentialEncryptionService.js";
import { getOrCreateEmailIntegration, toSafeIntegrationStatus } from "../services/emailIntegrationStatus.service.js";
import { syncEmailIntegration, testImapConnection } from "../services/emailInboundSyncService.js";
import {
  createGmailClientFromTokens,
  decodeIdToken,
  exchangeGmailAuthorizationCode,
  generateGmailAuthorizationUrl,
  getGmailProfile,
  GMAIL_SCOPES,
  revokeGmailAuthorization,
  verifyGmailState
} from "../services/gmail/gmailOAuth.service.js";
import { importMoreGmailMessages, runGmailSync } from "../services/gmail/gmailSync.service.js";
import EmailCampaignRecipient from "../models/EmailCampaignRecipient.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function clean(value) {
  return value ? String(value).trim() : "";
}

function email(value) {
  return clean(value).toLowerCase();
}

function assertEmail(value, label) {
  const normalized = email(value);
  if (!EMAIL_REGEX.test(normalized)) throw new ApiError(400, `${label} must be a valid email address.`);
  return normalized;
}

function assertText(value, label, max = 100) {
  const text = clean(value);
  if (!text) throw new ApiError(400, `${label} is required.`);
  if (/[\r\n]/.test(text)) throw new ApiError(400, `${label} cannot contain line breaks.`);
  if (text.length > max) throw new ApiError(400, `${label} is too long.`);
  return text;
}

function accountEmail(account = {}) {
  return email(account.email || account.accountEmail || account.companyName || account.firstName || "");
}

export const getEmailIntegrationStatus = asyncHandler(async (req, res) => {
  const integration = await getOrCreateEmailIntegration(req.user._id);
  res.json({ success: true, integration: toSafeIntegrationStatus(integration) });
});

export const connectBrevo = asyncHandler(async (req, res) => {
  const integration = await getOrCreateEmailIntegration(req.user._id);
  const providedApiKey = clean(req.body.apiKey);
  const apiKey = providedApiKey || (integration.brevo?.apiKeyEncrypted ? decryptCredential(integration.brevo.apiKeyEncrypted) : "");
  if (!apiKey) throw new ApiError(400, "Enter and verify your Brevo API key first.");
  const senderEmail = assertEmail(req.body.senderEmail, "Sender email");
  const replyToName = clean(req.body.replyToName).slice(0, 100);
  const replyToEmail = assertEmail(req.body.replyToEmail, "Reply-to email");

  const [account, senders] = await Promise.all([
    validateBrevoAccount(apiKey),
    fetchBrevoSenders(apiKey)
  ]);
  const selected = senders.find((sender) => sender.email === senderEmail);
  if (!selected || selected.active === false) {
    throw new ApiError(400, "Selected sender email is not verified in this Brevo account.");
  }

  integration.outboundProvider = "brevo";
  integration.brevo = {
    ...integration.brevo,
    apiKeyEncrypted: encryptCredential(apiKey),
    accountEmail: accountEmail(account),
    senderName: assertText(req.body.senderName || selected.name, "Sender name"),
    senderEmail,
    senderId: selected.id,
    replyToName,
    replyToEmail,
    verifiedSenders: senders,
    connected: true,
    connectedAt: integration.brevo?.connectedAt || new Date(),
    lastValidatedAt: new Date(),
    lastError: ""
  };
  await integration.save();
  console.info("[email-integration] Brevo connected", { userId: String(req.user._id), senderEmail });
  res.json({ success: true, brevo: toSafeIntegrationStatus(integration).brevo, integration: toSafeIntegrationStatus(integration) });
});

export const validateBrevo = asyncHandler(async (req, res) => {
  const apiKey = clean(req.body.apiKey);
  if (!apiKey) throw new ApiError(400, "Brevo API key is required.");
  const [account, senders] = await Promise.all([validateBrevoAccount(apiKey), fetchBrevoSenders(apiKey)]);
  const integration = await getOrCreateEmailIntegration(req.user._id);
  integration.outboundProvider = "brevo";
  integration.brevo = {
    ...integration.brevo,
    apiKeyEncrypted: encryptCredential(apiKey),
    accountEmail: accountEmail(account),
    verifiedSenders: senders,
    connected: Boolean(integration.brevo?.connected && integration.brevo?.senderEmail),
    lastValidatedAt: new Date(),
    lastError: ""
  };
  await integration.save();
  console.info("[email-integration] Brevo senders fetched", { userId: String(req.user._id), senderCount: senders.length });
  res.json({ success: true, account: { email: accountEmail(account) }, senders });
});

export const listBrevoSenders = asyncHandler(async (req, res) => {
  const integration = await getOrCreateEmailIntegration(req.user._id);
  if (!integration.brevo?.apiKeyEncrypted) throw new ApiError(400, "Enter and verify your Brevo API key first.");
  const apiKey = decryptCredential(integration.brevo.apiKeyEncrypted);
  const senders = await fetchBrevoSenders(apiKey);
  integration.brevo.verifiedSenders = senders;
  integration.brevo.lastValidatedAt = new Date();
  integration.brevo.lastError = "";
  await integration.save();
  console.info("[email-integration] Brevo senders fetched", { userId: String(req.user._id), senderCount: senders.length });
  res.json({ success: true, senders });
});

export const updateBrevoSender = asyncHandler(async (req, res) => {
  const integration = await getOrCreateEmailIntegration(req.user._id);
  if (!integration.brevo?.connected) throw new ApiError(400, "Connect your Brevo account before updating sender settings.");
  const senderEmail = assertEmail(req.body.senderEmail, "Sender email");
  const selected = (integration.brevo.verifiedSenders || []).find((sender) => sender.email === senderEmail && sender.active !== false);
  if (!selected) throw new ApiError(400, "Selected sender email is not verified in this Brevo account.");
  integration.brevo.senderName = assertText(req.body.senderName || selected.name, "Sender name");
  integration.brevo.senderEmail = selected.email;
  integration.brevo.senderId = selected.id;
  integration.brevo.replyToName = clean(req.body.replyToName).slice(0, 100);
  integration.brevo.replyToEmail = assertEmail(req.body.replyToEmail, "Reply-to email");
  integration.brevo.lastValidatedAt = new Date();
  integration.brevo.lastError = "";
  await integration.save();
  res.json({ success: true, integration: toSafeIntegrationStatus(integration) });
});

export const disconnectBrevo = asyncHandler(async (req, res) => {
  const integration = await getOrCreateEmailIntegration(req.user._id);
  integration.brevo.apiKeyEncrypted = "";
  integration.brevo.accountEmail = "";
  integration.brevo.senderName = "";
  integration.brevo.senderEmail = "";
  integration.brevo.senderId = "";
  integration.brevo.replyToName = "";
  integration.brevo.replyToEmail = "";
  integration.brevo.verifiedSenders = [];
  integration.brevo.connected = false;
  integration.brevo.lastError = "";
  await integration.save();
  res.json({ success: true, integration: toSafeIntegrationStatus(integration) });
});

export const connectImap = asyncHandler(async (req, res) => {
  const mailboxEmail = assertEmail(req.body.email, "Email address");
  const host = assertText(req.body.host, "IMAP host", 255);
  const port = Number(req.body.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ApiError(400, "IMAP port must be numeric.");
  if (typeof req.body.secure !== "boolean") throw new ApiError(400, "Secure connection must be true or false.");
  const username = assertText(req.body.username, "Username", 255);
  const password = clean(req.body.password);
  if (!password) throw new ApiError(400, "App password is required.");

  try {
    await testImapConnection({ host, port, secure: req.body.secure, username, password });
  } catch {
    throw new ApiError(400, "IMAP authentication failed. Check the mailbox settings and app password.");
  }

  const integration = await getOrCreateEmailIntegration(req.user._id);
  integration.inboundProvider = "imap";
  integration.inbound = {
    ...integration.inbound,
    email: mailboxEmail,
    host,
    port,
    secure: req.body.secure,
    username,
    passwordEncrypted: encryptCredential(password),
    mailbox: clean(req.body.mailbox) || "INBOX",
    connected: true,
    connectedAt: integration.inbound?.connectedAt || new Date(),
    lastValidatedAt: new Date(),
    syncEnabled: true,
    syncStatus: "idle",
    lastError: ""
  };
  await integration.save();
  console.info("[email-integration] IMAP connected", { userId: String(req.user._id), email: mailboxEmail, host });
  res.json({ success: true, integration: toSafeIntegrationStatus(integration) });
});

export const testImap = asyncHandler(async (req, res) => {
  const host = assertText(req.body.host, "IMAP host", 255);
  const port = Number(req.body.port);
  const username = assertText(req.body.username, "Username", 255);
  const password = clean(req.body.password);
  if (!password) throw new ApiError(400, "App password is required.");
  if (typeof req.body.secure !== "boolean") throw new ApiError(400, "Secure connection must be true or false.");
  await testImapConnection({ host, port, secure: req.body.secure, username, password });
  res.json({ success: true });
});

export const disconnectImap = asyncHandler(async (req, res) => {
  const integration = await getOrCreateEmailIntegration(req.user._id);
  integration.inbound.email = "";
  integration.inbound.host = "";
  integration.inbound.username = "";
  integration.inbound.passwordEncrypted = "";
  integration.inbound.connected = false;
  integration.inbound.syncEnabled = false;
  integration.inbound.syncStatus = "not_connected";
  integration.inbound.lastError = "";
  await integration.save();
  res.json({ success: true, integration: toSafeIntegrationStatus(integration) });
});

export const syncNow = asyncHandler(async (req, res) => {
  const integration = await getOrCreateEmailIntegration(req.user._id);
  const result = await syncEmailIntegration(integration);
  res.json(result);
});

export const getGmailAuthUrl = asyncHandler(async (req, res) => {
  // generateGmailAuthorizationUrl asserts config + signs the state (userId, HMAC, timestamp).
  const authUrl = generateGmailAuthorizationUrl({ userId: req.user._id });
  res.json({ success: true, authUrl });
});

// Public callback — Google calls this without the app JWT, so authorization relies entirely on the
// signed state. Tokens are exchanged, encrypted, and stored server-side; never returned to the browser.
export const gmailCallback = asyncHandler(async (req, res) => {
  const frontend = (process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
  const redirect = (params) => res.redirect(`${frontend}/settings/email?${params}`);

  const { error, code, state } = req.query;
  if (error) return redirect(`gmail=error&reason=${encodeURIComponent(String(error).slice(0, 40))}`);

  const verified = verifyGmailState(state);
  if (!verified?.userId) return redirect("gmail=error&reason=invalid_state");
  if (!code) return redirect("gmail=error&reason=missing_code");

  try {
    const tokens = await exchangeGmailAuthorizationCode(code);
    const gmailClient = createGmailClientFromTokens(tokens);
    const profile = await getGmailProfile(gmailClient);
    const claims = decodeIdToken(tokens.id_token);

    const integration = await getOrCreateEmailIntegration(verified.userId);
    const email = String(profile.emailAddress || claims.email || "").toLowerCase();

    integration.gmail = integration.gmail || {};
    integration.gmail.email = email;
    integration.gmail.displayName = claims.name || integration.gmail.displayName || "";
    integration.gmail.providerAccountId = claims.sub || integration.gmail.providerAccountId || "";
    integration.gmail.accessTokenEncrypted = tokens.access_token ? encryptCredential(tokens.access_token) : integration.gmail.accessTokenEncrypted;
    // Preserve an existing refresh token when Google omits one on reconnect.
    if (tokens.refresh_token) integration.gmail.refreshTokenEncrypted = encryptCredential(tokens.refresh_token);
    integration.gmail.tokenExpiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : integration.gmail.tokenExpiresAt;
    integration.gmail.grantedScopes = tokens.scope ? tokens.scope.split(" ") : GMAIL_SCOPES;
    integration.gmail.gmailHistoryId = profile.historyId ? String(profile.historyId) : integration.gmail.gmailHistoryId || "";
    integration.gmail.gmailInitialSyncComplete = false;
    integration.gmail.gmailNextPageToken = "";
    integration.gmail.connected = true;
    integration.gmail.connectedAt = integration.gmail.connectedAt || new Date();
    integration.gmail.lastValidatedAt = new Date();
    integration.gmail.syncEnabled = true;
    integration.gmail.syncStatus = "idle";
    integration.gmail.lastError = "";
    integration.gmail.lastErrorType = "";

    integration.outboundProvider = "gmail";
    integration.inboundProvider = "gmail_oauth";
    // Mirror legacy inbound flags so any code that still reads them treats Gmail as connected.
    integration.inbound = integration.inbound || {};
    integration.inbound.connected = true;
    integration.inbound.syncEnabled = true;
    integration.inbound.syncStatus = "idle";
    integration.inbound.email = email;

    await integration.save();
    console.info("[gmail] connected", { userId: String(verified.userId), email });

    // Kick off the initial mailbox sync in the background; the sync worker also picks it up.
    runGmailSync(integration).catch(() => {});

    return redirect("gmail=connected");
  } catch (err) {
    // Classify the failure into a specific, safe reason so the owner can fix config quickly.
    // Never logs tokens or the auth code — only error name/status and Google's error slug.
    const status = err?.code || err?.response?.status || null;
    const googleError = err?.errors?.[0]?.reason || err?.response?.data?.error || err?.response?.data?.error_description || "";
    const msg = String(err?.message || "");
    let reason = "connection_failed";
    if (/ENCRYPTION_KEY/i.test(msg)) {
      reason = "encryption_key";
    } else if (status === 403 && (googleError === "accessNotConfigured" || /has not been used in project|is disabled|accessNotConfigured/i.test(msg))) {
      reason = "api_disabled";
    } else if (["invalid_grant", "invalid_request", "unauthorized_client", "invalid_client"].includes(String(googleError))) {
      reason = "token_exchange";
    } else if (status === 401) {
      reason = "token_exchange";
    }
    console.error("[gmail] callback failed", { reason, status, googleError: googleError || null, name: err?.name, message: msg });
    return redirect(`gmail=error&reason=${reason}`);
  }
});

export const importMoreGmail = asyncHandler(async (req, res) => {
  const integration = await getOrCreateEmailIntegration(req.user._id);
  if (!integration.gmail?.connected) throw new ApiError(400, "Connect Gmail before importing older emails.");
  const result = await importMoreGmailMessages(integration);
  res.json(result);
});

export const disconnectGmail = asyncHandler(async (req, res) => {
  const integration = await getOrCreateEmailIntegration(req.user._id);

  // Best-effort Google revocation; a failure must not block the local disconnect.
  await revokeGmailAuthorization(integration);

  integration.gmail = integration.gmail || {};
  integration.gmail.accessTokenEncrypted = "";
  integration.gmail.refreshTokenEncrypted = "";
  integration.gmail.tokenExpiresAt = undefined;
  integration.gmail.gmailHistoryId = "";
  integration.gmail.gmailNextPageToken = "";
  integration.gmail.gmailInitialSyncComplete = false;
  integration.gmail.connected = false;
  integration.gmail.syncEnabled = false;
  integration.gmail.syncStatus = "not_connected";
  integration.gmail.lastError = "";
  integration.gmail.lastErrorType = "";

  // Stop sending through Gmail; revert providers to legacy defaults.
  if (integration.outboundProvider === "gmail") integration.outboundProvider = "brevo";
  if (integration.inboundProvider === "gmail_oauth") {
    integration.inboundProvider = "imap";
    integration.inbound.connected = false;
    integration.inbound.syncStatus = "not_connected";
  }
  await integration.save();

  // Pause any queued Gmail campaign recipients for this user so the worker stops sending.
  await EmailCampaignRecipient.updateMany(
    { userId: req.user._id, status: { $in: ["queued", "processing"] } },
    { $set: { status: "paused", error: "Gmail disconnected." } }
  ).catch(() => {});

  // Imported local email history is intentionally preserved.
  res.json({ success: true, integration: toSafeIntegrationStatus(integration) });
});
