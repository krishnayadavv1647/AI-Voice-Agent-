const statusTone = {
  active: "positive",
  connected: "positive",
  closed: "positive",
  completed: "positive",
  sent: "positive",
  replied: "positive",
  imported: "positive",
  valid: "positive",
  answered: "positive",
  found: "positive",
  saved: "positive",
  new: "accent",
  validated: "accent",
  scheduled: "accent",
  booked: "accent",
  appointment_booked: "accent",
  open: "info",
  uploaded: "info",
  rescheduled: "info",
  running: "info",
  calling: "info",
  in_progress: "info",
  interested: "info",
  contacted: "info",
  paused: "warn",
  needs_reply: "warn",
  partially_sent: "warn",
  sending: "warn",
  "missing date": "warn",
  "missing time": "warn",
  "past date/time": "warn",
  missed: "warn",
  no_answer: "warn",
  busy: "warn",
  pending: "warn",
  initiated: "warn",
  user_hangup: "warn",
  unsaved: "warn",
  follow_up: "warn",
  invalid: "danger",
  "invalid phone": "danger",
  failed: "danger",
  declined: "danger",
  pipeline_error: "danger",
  lost: "danger",
  unable_to_reach: "danger",
  draft: "neutral",
  skipped: "neutral",
  queued: "neutral",
  duplicate: "neutral",
  not_requested: "neutral",
  cancelled: "neutral",
  unknown: "neutral",
  "not found": "neutral",
  "not interested": "neutral",
  not_interested: "neutral"
};

const toneStyles = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-700 before:bg-emerald-600",
  info: "border-sky-200 bg-sky-50 text-sky-700 before:bg-sky-600",
  accent: "border-brand-200 bg-brand-50 text-brand-700 before:bg-brand-600",
  warn: "border-amber-200 bg-amber-50 text-amber-700 before:bg-amber-600",
  danger: "border-rose-200 bg-rose-50 text-rose-700 before:bg-rose-600",
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-700 before:bg-neutral-500"
};

export default function StatusBadge({ status }) {
  const label = status || "Unknown";
  const tone = statusTone[String(label).toLowerCase()] || "neutral";

  return (
    <span className={`badge before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full ${toneStyles[tone]}`}>
      {label}
    </span>
  );
}
