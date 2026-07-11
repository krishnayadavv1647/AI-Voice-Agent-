import { createAuthorizedGmailClient } from "./gmailOAuth.service.js";

// Applies label changes to a single Gmail message (used for star/unstar, archive, etc.).
export async function modifyGmailMessage(integration, messageId, { addLabelIds = [], removeLabelIds = [] } = {}) {
  const { gmail } = createAuthorizedGmailClient(integration);
  const { data } = await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { addLabelIds, removeLabelIds }
  });
  return data;
}

// Removes the UNREAD label from every message in a Gmail thread (mirrors "mark thread read").
export async function markGmailThreadRead(integration, gmailThreadId) {
  const { gmail } = createAuthorizedGmailClient(integration);
  const { data } = await gmail.users.threads.modify({
    userId: "me",
    id: gmailThreadId,
    requestBody: { removeLabelIds: ["UNREAD"] }
  });
  return data;
}

export async function starGmailMessage(integration, messageId, starred = true) {
  return modifyGmailMessage(integration, messageId, {
    addLabelIds: starred ? ["STARRED"] : [],
    removeLabelIds: starred ? [] : ["STARRED"]
  });
}

// Soft delete only. Gmail keeps the message in Trash; we never permanently delete.
export async function trashGmailMessage(integration, messageId) {
  const { gmail } = createAuthorizedGmailClient(integration);
  const { data } = await gmail.users.messages.trash({ userId: "me", id: messageId });
  return data;
}

export async function untrashGmailMessage(integration, messageId) {
  const { gmail } = createAuthorizedGmailClient(integration);
  const { data } = await gmail.users.messages.untrash({ userId: "me", id: messageId });
  return data;
}
