// Client-side mirror of backend/src/utils/phone.js `toE164`, used to preview whether the business
// contactNumber is valid for human call-forwarding. Kept in sync with the backend normalizer so the
// UI's "forwarding on/off" hint matches what the server actually attaches to the Vapi assistant.
export function toE164(raw, { defaultCountryCode = "91" } = {}) {
  if (!raw) return null;

  const cc = String(defaultCountryCode).replace(/[^\d]/g, "") || "91";

  let s = String(raw).trim();
  const hasPlus = s.startsWith("+");
  s = (hasPlus ? "+" : "") + s.replace(/[^\d]/g, "");

  if (s.startsWith("+")) {
    return /^\+\d{8,15}$/.test(s) ? s : null;
  }

  const digits = s.replace(/^0+/, "");
  if (!digits) return null;

  if (digits.startsWith(cc) && digits.length >= 11) {
    return /^\+\d{8,15}$/.test("+" + digits) ? "+" + digits : null;
  }

  const candidate = "+" + cc + digits;
  return /^\+\d{8,15}$/.test(candidate) ? candidate : null;
}
