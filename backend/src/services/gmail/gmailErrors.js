// Central classification of Google/Gmail API errors so callers (sync, send, worker) can decide
// whether to retry, reschedule, or permanently disconnect — without leaking raw Google errors
// to the frontend and without logging any credential material.

export function gmailErrorReason(error) {
  return String(
    error?.response?.data?.error ||
    error?.response?.data?.error?.status ||
    error?.errors?.[0]?.reason ||
    error?.reason ||
    ""
  ).toLowerCase();
}

export function gmailErrorStatus(error) {
  return Number(error?.code || error?.status || error?.response?.status || 0);
}

// A permanently invalid grant means the user revoked access or the refresh token died.
// The only fix is a reconnect, so we should stop syncing/sending for this integration.
export function isGmailAuthError(error) {
  const reason = gmailErrorReason(error);
  const status = gmailErrorStatus(error);
  if (reason.includes("invalid_grant") || reason.includes("unauthorized_client")) return true;
  if (reason.includes("insufficient") && reason.includes("scope")) return true;
  if (status === 401) return true;
  // 403 with an auth/permission reason (not a rate-limit 403).
  if (status === 403 && (reason.includes("insufficientpermissions") || reason.includes("forbidden"))) return true;
  return false;
}

export function isGmailRateLimitError(error) {
  const reason = gmailErrorReason(error);
  const status = gmailErrorStatus(error);
  if (status === 429) return true;
  if (status === 403 && (reason.includes("ratelimit") || reason.includes("userratelimit") || reason.includes("quota"))) return true;
  return false;
}

// Gmail returns 404 on history.list when the stored startHistoryId is too old to serve.
export function isGmailHistoryExpired(error) {
  return gmailErrorStatus(error) === 404;
}

export function isGmailTemporaryError(error) {
  const status = gmailErrorStatus(error);
  if (isGmailRateLimitError(error)) return true;
  if (status >= 500 && status <= 599) return true;
  // Network-level failures (no HTTP status) are treated as temporary.
  const code = String(error?.code || "");
  if (!status && /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/.test(code)) return true;
  return false;
}

// Coarse class used to set integration.gmail.lastErrorType.
export function classifyGmailError(error) {
  if (isGmailAuthError(error)) return "auth";
  if (isGmailRateLimitError(error)) return "rate_limit";
  if (isGmailTemporaryError(error)) return "temporary";
  return "permanent";
}

// A retriable send/sync failure: temporary infra/rate issues, never permanent/auth/validation.
export function isGmailRetryable(error) {
  return isGmailTemporaryError(error) && !isGmailAuthError(error);
}

// Safe, user-facing message. Never includes Google's raw error payload.
export function safeGmailErrorMessage(error, fallback = "Gmail request failed. Please try again.") {
  if (isGmailAuthError(error)) return "Gmail authorization expired. Reconnect Gmail.";
  if (isGmailRateLimitError(error)) return "Gmail sending limit reached. Please try again later.";
  if (isGmailTemporaryError(error)) return "Gmail is temporarily unavailable. Please try again.";
  return fallback;
}
