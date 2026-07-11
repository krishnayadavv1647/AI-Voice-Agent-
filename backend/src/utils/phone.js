// Best-effort E.164 normalizer for the agent's contactNumber. Returns a valid E.164 string
// (e.g. "+919876543210") or null if it can't be confidently normalized.
// Assumes a default country when the number has no country code. DEFAULT_PHONE_COUNTRY_CODE
// (digits only, e.g. "91" for India) can override the fallback for a different user base.
export function toE164(raw, { defaultCountryCode } = {}) {
  if (!raw) return null;

  const cc = String(defaultCountryCode || process.env.DEFAULT_PHONE_COUNTRY_CODE || "91").replace(/[^\d]/g, "") || "91";

  let s = String(raw).trim();
  // Keep a leading +, strip everything else that isn't a digit.
  const hasPlus = s.startsWith("+");
  s = (hasPlus ? "+" : "") + s.replace(/[^\d]/g, "");

  if (s.startsWith("+")) {
    // Already has a country code. Basic sanity: + and 8..15 digits.
    return /^\+\d{8,15}$/.test(s) ? s : null;
  }

  // No +: assume a local number. Handle a leading 0 (common in local formats).
  const digits = s.replace(/^0+/, "");
  if (!digits) return null;

  // If it already begins with the default country code and is long enough, just prefix +.
  if (digits.startsWith(cc) && digits.length >= 11) {
    return /^\+\d{8,15}$/.test("+" + digits) ? "+" + digits : null;
  }

  const candidate = "+" + cc + digits;
  return /^\+\d{8,15}$/.test(candidate) ? candidate : null;
}
