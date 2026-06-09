export async function sendEmail({ toEmail, toName, subject, replyTo }) {
  return {
    success: true,
    provider: "mock",
    messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    toEmail,
    toName,
    subject,
    replyTo
  };
}

export function isConfigured() {
  return true;
}
