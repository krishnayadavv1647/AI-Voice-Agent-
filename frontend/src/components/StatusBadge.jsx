const styles = {
  Active: "bg-emerald-50 text-emerald-700",
  Connected: "bg-sky-50 text-sky-700",
  Draft: "bg-slate-100 text-slate-700",
  Paused: "bg-amber-50 text-amber-700",
  New: "bg-brand-50 text-brand-700",
  Closed: "bg-emerald-50 text-emerald-700"
};

export default function StatusBadge({ status }) {
  return <span className={`badge ${styles[status] || "bg-slate-100 text-slate-700"}`}>{status || "Unknown"}</span>;
}
