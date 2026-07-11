// App-level Gmail sending caps, kept deliberately BELOW Gmail's own account limits so the app never
// pushes an account toward a Google-side block. Override per-deployment with the GMAIL_DAILY_LIMITS
// env var (JSON, e.g. {"free":25,"starter":75,"pro":150,"agency":250}).
const DEFAULT_GMAIL_DAILY_LIMITS = { free: 25, starter: 75, pro: 150, agency: 250 };

export function gmailDailyLimit(plan) {
  let overrides = {};
  if (process.env.GMAIL_DAILY_LIMITS) {
    try {
      const parsed = JSON.parse(process.env.GMAIL_DAILY_LIMITS);
      if (parsed && typeof parsed === "object") overrides = parsed;
    } catch {
      // ignore malformed override; fall back to defaults
    }
  }
  const key = String(plan || "free").toLowerCase();
  const value = overrides[key] ?? DEFAULT_GMAIL_DAILY_LIMITS[key] ?? DEFAULT_GMAIL_DAILY_LIMITS.free;
  return Math.max(0, Number(value) || 0);
}
