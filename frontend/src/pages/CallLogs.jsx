import { Download, FileText, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../lib/api.js";

export default function CallLogs() {
  const [calls, setCalls] = useState([]);
  const [selected, setSelected] = useState(null);

  async function load() {
    setCalls(await api("/calls"));
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id) {
    if (!confirm("Delete this call log?")) return;
    await api(`/calls/${id}`, { method: "DELETE" });
    load();
  }

  function formatDuration(call) {
    if (typeof call.durationSeconds === "number") {
      const minutes = Math.floor(call.durationSeconds / 60);
      const seconds = call.durationSeconds % 60;
      return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }

    return call.duration || "Pending";
  }

  async function sync(id) {
    await api(`/calls/${id}/sync`, { method: "POST" });
    load();
  }

  return (
    <>
      <PageHeader title="Call Logs" description="Review transcripts, recordings, summaries, and lead capture status." />
      <div className="card overflow-hidden p-0">
        <table className="table w-full min-w-[900px]">
          <thead><tr><th>Caller</th><th>Agent</th><th>Run ID</th><th>Duration</th><th>Status</th><th>Date</th><th>Lead</th><th>Summary</th><th>Actions</th></tr></thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call._id}>
                <td>{call.callerNumber || "Unknown"}</td>
                <td>{call.agentId?.agentName || "Agent"}</td>
                <td>{call.dograhRunId || "Missing"}</td>
                <td>{formatDuration(call)}</td>
                <td>{call.status || "Logged"}</td>
                <td>{new Date(call.createdAt).toLocaleString()}</td>
                <td>{call.leadCaptured ? "Yes" : "No"}</td>
                <td>{call.summary || "No summary from Dograh"}</td>
                <td className="flex gap-2">
                  <button title="View Transcript" className="rounded-lg border border-slate-200 p-2" onClick={() => setSelected(call)}><FileText size={16} /></button>
                  <button title={call.dograhRunId ? "Sync" : "Dograh Run ID missing. Please trigger a new call or check Dograh trigger response mapping."} disabled={!call.dograhRunId} className="rounded-lg border border-slate-200 p-2 disabled:opacity-50" onClick={() => sync(call._id)}><RefreshCw size={16} /></button>
                  {call.recordingUrl && <a title="Play Recording" className="rounded-lg border border-slate-200 p-2" href={call.recordingUrl}><Download size={16} /></a>}
                  {call.transcriptUrl && <a title="Open Transcript" className="rounded-lg border border-slate-200 p-2" href={call.transcriptUrl}><FileText size={16} /></a>}
                  <button title="Delete" className="rounded-lg border border-slate-200 p-2 text-rose-600" onClick={() => remove(call._id)}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-6" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-bold text-ink">Call Log Details</h2>
            <p className="mt-3 text-sm font-semibold text-slate-500">Dograh IDs</p>
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm">{JSON.stringify({
              dograhRunId: selected.dograhRunId,
              dograhWorkflowId: selected.dograhWorkflowId,
              dograhWorkflowUuid: selected.dograhWorkflowUuid
            }, null, 2)}</pre>
            <p className="mt-3 text-sm font-semibold text-slate-500">Transcript</p>
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm">{selected.transcript || "No transcript"}</pre>
            <p className="mt-4 text-sm font-semibold text-slate-500">Summary</p>
            <p className="mt-2 text-sm">{selected.summary || "No summary from Dograh"}</p>
            <p className="mt-4 text-sm font-semibold text-slate-500">Recording URL</p>
            <p className="mt-2 break-words text-sm">{selected.recordingUrl || "No recording"}</p>
            <p className="mt-4 text-sm font-semibold text-slate-500">Transcript URL</p>
            <p className="mt-2 break-words text-sm">{selected.transcriptUrl || "No transcript link"}</p>
          </div>
        </div>
      )}
    </>
  );
}
