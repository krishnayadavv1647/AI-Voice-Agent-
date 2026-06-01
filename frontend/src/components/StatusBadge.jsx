const styles = {
  Active: "bg-emerald-50 text-emerald-700",
  active: "bg-emerald-50 text-emerald-700",
  Connected: "bg-sky-50 text-sky-700",
  connected: "bg-sky-50 text-sky-700",
  Draft: "bg-slate-100 text-slate-700",
  draft: "bg-slate-100 text-slate-700",
  Paused: "bg-amber-50 text-amber-700",
  New: "bg-brand-50 text-brand-700",
  Closed: "bg-emerald-50 text-emerald-700",
  Completed: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  Failed: "bg-rose-50 text-rose-700",
  failed: "bg-rose-50 text-rose-700",
  Pending: "bg-amber-50 text-amber-700",
  pending: "bg-amber-50 text-amber-700",
  initiated: "bg-amber-50 text-amber-700",
  user_hangup: "bg-orange-50 text-orange-700",
  pipeline_error: "bg-rose-50 text-rose-700",
  Unsaved: "bg-amber-50 text-amber-700",
  Saved: "bg-emerald-50 text-emerald-700",
  Booked: "bg-violet-50 text-violet-700",
  Interested: "bg-blue-50 text-blue-700",
  Contacted: "bg-cyan-50 text-cyan-700",
  "Not Interested": "bg-slate-100 text-slate-700"
};

export default function StatusBadge({ status }) {
  return <span className={`badge ${styles[status] || "bg-slate-100 text-slate-700"}`}>{status || "Unknown"}</span>;
}
