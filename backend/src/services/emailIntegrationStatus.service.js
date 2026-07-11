import EmailIntegration from "../models/EmailIntegration.js";
import { decryptCredential, maskCredential } from "./credentialEncryptionService.js";

export async function getOrCreateEmailIntegration(userId) {
  return EmailIntegration.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        "brevo.connected": false,
        "inbound.connected": false,
        "inbound.syncStatus": "not_connected",
        "settings.autoSync": true
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

export function toSafeIntegrationStatus(integration) {
  const brevoKey = integration?.brevo?.apiKeyEncrypted
    ? decryptCredential(integration.brevo.apiKeyEncrypted)
    : "";
  const verifiedSender = Boolean(
    integration?.brevo?.senderEmail &&
    integration?.brevo?.verifiedSenders?.some((sender) => sender.email === integration.brevo.senderEmail && sender.active !== false)
  );
  const replyToMatchesMailbox = Boolean(
    integration?.brevo?.replyToEmail &&
    integration?.inbound?.email &&
    integration.brevo.replyToEmail.toLowerCase() === integration.inbound.email.toLowerCase()
  );

  // --- Gmail status (never exposes tokens; no decryption needed) ---
  const g = integration?.gmail || {};
  const gmailConnected = Boolean(g.connected && g.email);
  const hasModifyScope = Array.isArray(g.grantedScopes)
    ? g.grantedScopes.includes(GMAIL_MODIFY_SCOPE)
    : true; // older records predate scope tracking; assume modify was granted.
  const gmail = {
    connected: gmailConnected,
    email: g.email || "",
    displayName: g.displayName || "",
    canRead: Boolean(gmailConnected && g.syncEnabled !== false),
    canSend: Boolean(gmailConnected && hasModifyScope),
    syncEnabled: g.syncEnabled !== false,
    syncStatus: g.syncStatus || "not_connected",
    lastSyncedAt: g.lastSyncedAt || null,
    lastError: g.lastError || null,
    lastErrorType: g.lastErrorType || null,
    initialSyncComplete: Boolean(g.gmailInitialSyncComplete),
    hasMore: Boolean(g.gmailNextPageToken),
    connectedAt: g.connectedAt || null
  };

  return {
    gmail,
    brevo: {
      connected: Boolean(integration?.brevo?.connected),
      hasApiKey: Boolean(integration?.brevo?.apiKeyEncrypted),
      accountEmail: integration?.brevo?.accountEmail || "",
      senderName: integration?.brevo?.senderName || "",
      senderEmail: integration?.brevo?.senderEmail || "",
      senderId: integration?.brevo?.senderId || "",
      replyToName: integration?.brevo?.replyToName || "",
      replyToEmail: integration?.brevo?.replyToEmail || "",
      maskedApiKey: brevoKey ? maskCredential(brevoKey) : "",
      verifiedSender,
      verifiedSenders: (integration?.brevo?.verifiedSenders || []).map((sender) => ({
        id: sender.id,
        name: sender.name,
        email: sender.email,
        active: sender.active
      })),
      lastValidatedAt: integration?.brevo?.lastValidatedAt || null,
      lastError: integration?.brevo?.lastError || null
    },
    inbound: {
      connected: Boolean(integration?.inbound?.connected),
      provider: integration?.inboundProvider || "imap",
      email: integration?.inbound?.email || "",
      host: integration?.inbound?.host || "",
      port: integration?.inbound?.port || 993,
      secure: integration?.inbound?.secure !== false,
      username: integration?.inbound?.username || "",
      maskedPassword: integration?.inbound?.passwordEncrypted ? maskCredential("password") : "",
      syncEnabled: integration?.inbound?.syncEnabled !== false,
      syncStatus: integration?.inbound?.syncStatus || "not_connected",
      lastSyncedAt: integration?.inbound?.lastSyncedAt || null,
      lastError: integration?.inbound?.lastError || null
    },
    setup: {
      // Gmail is the active provider: setup readiness is driven entirely by the Gmail connection.
      canSend: gmail.canSend,
      canReceive: gmail.canRead,
      replyToMatchesMailbox,
      fullyConfigured: gmail.connected && gmail.canSend
    }
  };
}
