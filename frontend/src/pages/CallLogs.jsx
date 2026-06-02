import { Download, FileText, PlayCircle, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

function formatDuration(call) {
  if (typeof call.durationSeconds === "number") {
    const minutes = Math.floor(call.durationSeconds / 60);
    const seconds = call.durationSeconds % 60;
    return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }
  return call.duration || "Pending";
}

export default function CallLogs() {
  const [calls, setCalls] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      setCalls(await api("/calls"));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id) {
    if (!confirm("Delete this call log?")) return;
    await api(`/calls/${id}`, { method: "DELETE" });
    load();
  }

  async function sync(id) {
    await api(`/calls/${id}/sync`, { method: "POST" });
    load();
  }

  return (
    <>
      <PageHeader title="Call Logs" description="Review Dograh run data, recordings, transcripts, summaries, and lead extraction status." />
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {!calls.length ? (
        <EmptyState title="No calls yet. Start a test call to see call logs." description="Completed Dograh runs will sync duration, status, transcript URL, and recording URL." />
      ) : (
        <>
          <div className="mobile-card-list">
            {calls.map((call) => (
              <CallCard key={call._id} call={call} setSelected={setSelected} sync={sync} remove={remove} />
            ))}
          </div>
          <div className="desktop-table card overflow-hidden p-0">
            <div className="table-wrap">
              <table className="table w-full min-w-[1100px]">
                <thead><tr><th>Date</th><th>Caller Number</th><th>Agent</th><th>Status</th><th>Duration</th><th>Dograh Run ID</th><th>Lead</th><th>Recording</th><th>Actions</th></tr></thead>
                <tbody>
                  {calls.map((call) => (
                    <tr key={call._id}>
                      <td>{new Date(call.createdAt).toLocaleString()}</td>
                      <td className="break-anywhere">{call.callerNumber || "Unknown"}</td>
                      <td>{call.agentId?.agentName || "Agent"}</td>
                      <td><StatusBadge status={call.status || "pending"} /></td>
                      <td>{formatDuration(call)}</td>
                      <td className="break-anywhere">{call.dograhRunId || "Missing"}</td>
                      <td>{call.leadCaptured ? "Yes" : "No"}</td>
                      <td>{call.recordingUrl ? <audio controls src={call.recordingUrl} className="w-full max-w-[180px]" /> : "-"}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button title="View Details" className="rounded-xl border border-slate-200 p-2" onClick={() => setSelected(call)}><FileText size={16} /></button>
                          <button title="Sync Call" disabled={!call.dograhRunId} className="rounded-xl border border-slate-200 p-2 disabled:opacity-50" onClick={() => sync(call._id)}><RefreshCw size={16} /></button>
                          {call.recordingUrl && <a title="Play Recording" className="rounded-xl border border-slate-200 p-2" href={call.recordingUrl} target="_blank"><PlayCircle size={16} /></a>}
                          {call.transcriptUrl && <a title="View Transcript" className="rounded-xl border border-slate-200 p-2" href={call.transcriptUrl} target="_blank"><Download size={16} /></a>}
                          <button title="Delete" className="rounded-xl border border-slate-200 p-2 text-rose-600" onClick={() => remove(call._id)}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selected && <CallModal call={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function CallCard({ call, setSelected, sync, remove }) {
  return (
    <article className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-anywhere font-bold text-slate-950">{call.callerNumber || "Unknown caller"}</p>
          <p className="text-sm text-slate-500">{new Date(call.createdAt).toLocaleString()}</p>
        </div>
        <StatusBadge status={call.status || "pending"} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Info label="Duration" value={formatDuration(call)} />
        <Info label="Lead" value={call.leadCaptured ? "Yes" : "No"} />
        <Info label="Agent" value={call.agentId?.agentName || "Agent"} />
        <Info label="Run ID" value={call.dograhRunId || "Missing"} />
      </div>
      <div className="mt-4 action-row">
        <button className="btn-secondary" onClick={() => setSelected(call)}>View Details</button>
        <button className="btn-secondary" disabled={!call.dograhRunId} onClick={() => sync(call._id)}>Sync</button>
        <button className="btn-danger" onClick={() => remove(call._id)}>Delete</button>
      </div>
    </article>
  );
}

function CallModal({ call, onClose }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="modal-panel rounded-3xl bg-white p-4 shadow-2xl sm:max-w-4xl sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Call Detail</h2>
            <p className="text-sm text-slate-500">Dograh run, transcript, recording, and extracted lead data.</p>
          </div>
          <button className="rounded-xl border border-slate-200 p-2" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Info label="Status" value={call.status} />
          <Info label="Duration" value={formatDuration(call)} />
          <Info label="Start Time" value={call.startedAt ? new Date(call.startedAt).toLocaleString() : ""} />
          <Info label="End Time" value={call.endedAt ? new Date(call.endedAt).toLocaleString() : ""} />
          <Info label="Caller Number" value={call.callerNumber} />
          <Info label="Calling Number" value={call.callingNumber} />
          <Info label="Dograh Run ID" value={call.dograhRunId} />
          <Info label="Workflow UUID" value={call.dograhWorkflowUuid} />
        </div>
        {call.recordingUrl && <div className="mt-5 rounded-2xl border border-slate-200 p-4"><p className="mb-2 text-sm font-semibold">Recording</p><audio className="w-full" controls src={call.recordingUrl} /></div>}
        <Block title="Summary" value={call.summary || "No summary from Dograh"} />
        <Block title="Transcript" value={call.transcript || "No transcript"} />
        <Block title="Extracted Lead Data" value={call.leadData ? JSON.stringify(call.leadData, null, 2) : "No extracted lead data returned by Dograh."} pre />
        <details className="mt-5 rounded-2xl border border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Raw debug data</summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(call.rawRunDetails || call.rawDograhPayload || {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return <div className="min-w-0 rounded-2xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="break-anywhere text-sm font-semibold text-slate-950">{value || "Not provided"}</p></div>;
}

function Block({ title, value, pre = false }) {
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 p-4">
      <p className="mb-2 text-sm font-semibold text-slate-950">{title}</p>
      {pre ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">{value}</pre> : <p className="max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>}
    </div>
  );
}
