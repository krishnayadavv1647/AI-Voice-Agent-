import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { getEmailProvider } from "./email/index.js";

// Persists an in-app notification and, best-effort, emails the user. Never throws: notification
// delivery must not break the billing/call flow that triggered it.
export async function queueNotification({ userId, type, title, body = "", dedupeKey = null, metadata = {}, email = false }) {
  let notification = null;
  try {
    if (dedupeKey) {
      const existing = await Notification.findOne({ userId, dedupeKey, read: false });
      if (existing) return existing;
    }
    notification = await Notification.create({ userId, type, title, body, dedupeKey, metadata });
  } catch (error) {
    console.warn("[notification] failed to persist in-app notification", { userId: String(userId), type, error: error?.message });
  }

  if (email) {
    try {
      const user = await User.findById(userId).select("email name");
      if (user?.email) {
        const provider = getEmailProvider();
        await provider.service.sendEmail({
          toEmail: user.email,
          toName: user.name || "",
          subject: title,
          body: `<p>${body}</p>`
        });
      }
    } catch (error) {
      console.warn("[notification] best-effort email failed", { userId: String(userId), type, error: error?.message });
    }
  }

  return notification;
}

// Specialized notice for an auto-deactivated Dograh key after repeated BYOK failures.
export async function notifyDograhKeyDeactivated({ userId, integrationId, lastFailureReason }) {
  return queueNotification({
    userId,
    type: "dograh_key_deactivated",
    title: "Your Dograh key was disabled",
    body: `Your Dograh API key failed repeatedly and has been disabled to avoid failed calls. Last error: ${lastFailureReason || "unknown"}. Reconnect or fix your key in Settings to resume bring-your-own-key calls.`,
    dedupeKey: `dograh_key_deactivated:${integrationId}`,
    metadata: { integrationId: String(integrationId), lastFailureReason },
    email: true
  });
}

export default { queueNotification, notifyDograhKeyDeactivated };
