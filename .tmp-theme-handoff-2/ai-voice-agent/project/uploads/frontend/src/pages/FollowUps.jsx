import { Eye, PhoneCall, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

function errorText(err) {
  return err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message;
}

function leadLabel(lead) {
  return lead?.businessName || lead?.contactName || lead?.name || lead?.phone || "Lead";
}

function triggerLabel(trigger) {
  const labels = {
    call_declined: "Call Declined",
    call_not_picked: "Not Picked",
    call_busy: "Busy",
    call_failed: "Failed",
    email_sent: "Email Sent",
    manual: "Manual"
  };
  return labels[trigger] || trigger || "-";
}

export default function FollowUps() {
  const [followUps, setFollowUps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const summary = useMemo(() => ({
    pending: followUps.filter((item) => item.status === "pending").length,
    scheduled: followUps.filter((item) => item.status === "scheduled").length,
    completed: followUps.filter((item) => item.status === "completed").length,
    failed: followUps.filter((item) => item.status === "failed").length
  }), [followUps]);

  async function load() {
    setLoading(true);
    setFollowUps(await api("/followups"));
    setLoading(false);
  }

  useEffect(() => {
    load().catch((err) => {
      setLoading(false);
      setError(errorText(err));
    });
  }, []);

  async function action(id, type) {
    setActingId(id);
    setNotice("");
    setError("");

    try {
      if (type === "reschedule") {
        const current = followUps.find((item) => item._id === id);
        const initial = current?.scheduledAt ? new Date(current.scheduledAt).toISOString().slice(0, 16) : "";
        const scheduledAt = prompt("New follow-up time", initial);
        if (!scheduledAt) return;
        await api(`/followups/${id}/reschedule`, { method: "POST", body: { scheduledAt: new Date(scheduledAt).toISOString() } });
        setNotice("Follow-up rescheduled.");
      } else if (type === "cancel") {
        if (!confirm("Cancel this follow-up?")) return;
        await api(`/followups/${id}/cancel`, { method: "POST" });
        setNotice("Follow-up cancelled.");
      } else if (type === "run") {
        await api(`/followups/${id}/run`, { method: "POST" });
        setNotice("Follow-up run started.");
      }

      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setActingId("");
    }
  }

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Scheduled follow-up calls created from email outreach and manual lead actions."
        action={<button className="btn-secondary" onClick={() => load().catch((err) => setError(errorText(err)))}><RefreshCw size={16} />Refresh</button>}
      />

      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Pending" value={summary.pending} />
        <SummaryCard label="Scheduled" value={summary.scheduled} />
        <SummaryCard label="Completed" value={summary.completed} />
        <SummaryCard label="Failed" value={summary.failed} />
      </div>

      <section className="card overflow-hidden p-0">
        {loading ? (
          <div className="p-6"><EmptyState title="Loading follow-ups..." /></div>
        ) : !followUps.length ? (
          <div className="p-6"><EmptyState title="No follow-ups yet" description="Successful email campaigns will schedule call follow-ups automatically." /></div>
        ) : (
          <div className="table-wrap">
            <table className="table w-full min-w-[1250px]">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Agent</th>
                  <th>Type</th>
                  <th>Last Call Outcome</th>
                  <th>Trigger Reason</th>
                  <th>Retry Scheduled At</th>
                  <th>Status</th>
                  <th>Attempt Count</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {followUps.map((followUp) => (
                  <tr key={followUp._id}>
                    <td className="break-anywhere">
                      <div className="font-semibold text-slate-950">{leadLabel(followUp.leadId)}</div>
                      <div className="text-xs text-slate-500">{followUp.leadId?.phone || followUp.leadId?.email || "-"}</div>
                    </td>
                    <td className="break-anywhere">{followUp.agentId?.agentName || "Agent"}</td>
                    <td>{followUp.type}</td>
                    <td><StatusBadge status={followUp.callLogId?.normalizedStatus || "unknown"} /></td>
                    <td>{triggerLabel(followUp.trigger)}</td>
                    <td>{followUp.scheduledAt ? new Date(followUp.scheduledAt).toLocaleString() : "-"}</td>
                    <td><StatusBadge status={followUp.status} /></td>
                    <td>{followUp.attemptCount || 0}/{followUp.maxAttempts || 3}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded-xl border border-slate-200 p-2" title="Run Now" disabled={actingId === followUp._id || ["completed", "cancelled", "running"].includes(followUp.status)} onClick={() => action(followUp._id, "run")}><PhoneCall size={16} /></button>
                        <button className="btn-secondary" disabled={actingId === followUp._id || ["completed", "cancelled"].includes(followUp.status)} onClick={() => action(followUp._id, "reschedule")}>Reschedule</button>
                        <button className="rounded-xl border border-slate-200 p-2 text-rose-600" title="Cancel" disabled={actingId === followUp._id || ["completed", "cancelled"].includes(followUp.status)} onClick={() => action(followUp._id, "cancel")}><XCircle size={16} /></button>
                        {followUp.leadId?._id && <Link className="rounded-xl border border-slate-200 p-2" title="View Lead" to="/leads"><Eye size={16} /></Link>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function SummaryCard({ label, value }) {
  return (
    <article className="card">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
    </article>
  );
}
