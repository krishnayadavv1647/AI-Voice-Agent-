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

  return {
    brevo: {
      connected: Boolean(integration?.brevo?.connected),
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
      canSend: Boolean(integration?.brevo?.connected && verifiedSender && integration?.brevo?.replyToEmail),
      canReceive: Boolean(integration?.inbound?.connected),
      replyToMatchesMailbox,
      fullyConfigured: Boolean(integration?.brevo?.connected && verifiedSender && integration?.brevo?.replyToEmail && integration?.inbound?.connected)
    }
  };
}
