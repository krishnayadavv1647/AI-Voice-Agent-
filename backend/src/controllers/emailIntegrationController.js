import crypto from "crypto";
import { fetchBrevoSenders, validateBrevoAccount } from "../services/brevoService.js";
import { decryptCredential, encryptCredential } from "../services/credentialEncryptionService.js";
import { getOrCreateEmailIntegration, toSafeIntegrationStatus } from "../services/emailIntegrationStatus.service.js";
import { syncEmailIntegration, testImapConnection } from "../services/emailInboundSyncService.js";
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

function signState(userId, nonce) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new ApiError(500, "JWT_SECRET is missing in backend environment");
  const payload = Buffer.from(JSON.stringify({ userId: String(userId), nonce, ts: Date.now() })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyState(state) {
  const [payload, signature] = String(state || "").split(".");
  if (!payload || !signature || !process.env.JWT_SECRET) return null;
  const expected = crypto.createHmac("sha256", process.env.JWT_SECRET).update(payload).digest("base64url");
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (Date.now() - Number(parsed.ts || 0) > 10 * 60 * 1000) return null;
  return parsed;
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
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_GMAIL_REDIRECT_URI) {
    throw new ApiError(400, "Gmail OAuth is not configured.");
  }
  const state = crypto.randomBytes(24).toString("hex");
  const signedState = signState(req.user._id, state);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_GMAIL_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    state: signedState
  });
  res.json({ success: true, authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

export const gmailCallback = asyncHandler(async (req, res) => {
  const state = verifyState(req.query.state);
  if (!state) throw new ApiError(400, "Invalid Gmail OAuth state.");
  res.redirect(`${process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173"}/settings/email?gmail=not_implemented`);
});

export const disconnectGmail = asyncHandler(async (req, res) => {
  const integration = await getOrCreateEmailIntegration(req.user._id);
  integration.inbound.accessTokenEncrypted = "";
  integration.inbound.refreshTokenEncrypted = "";
  integration.inbound.connected = false;
  integration.inbound.syncStatus = "not_connected";
  await integration.save();
  res.json({ success: true, integration: toSafeIntegrationStatus(integration) });
});
