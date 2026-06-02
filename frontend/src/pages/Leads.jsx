import { Download, FileText, PhoneCall, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const statuses = ["New", "Contacted", "Interested", "Booked", "Closed", "Not Interested"];

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(null);

  async function load() {
    setLeads(await api("/leads"));
  }

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(id, status) {
    await api(`/leads/${id}`, { method: "PUT", body: { status } });
    load();
  }

  async function addNote(id) {
    const note = prompt("Add note");
    if (!note) return;
    await api(`/leads/${id}`, { method: "PUT", body: { note } });
    load();
  }

  async function callAgain(id) {
    await api(`/leads/${id}/call-again`, { method: "POST" });
    load();
  }

  async function exportCsv() {
    const csv = await api("/leads/export/csv");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "leads.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader title="Leads" description="CRM-style lead management for customers captured from calls, callback forms, transcripts, and messages." action={<button className="btn-secondary" onClick={exportCsv}><Download size={16} />Export CSV</button>} />
      {!leads.length ? (
        <EmptyState title="No leads captured yet. Leads will appear after calls or messages." />
      ) : (
        <>
          <div className="mobile-card-list">
            {leads.map((lead) => (
              <article key={lead._id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-anywhere font-bold text-slate-950">{lead.name || "Unknown lead"}</p>
                    <p className="break-anywhere text-sm text-slate-500">{lead.phone || "-"}</p>
                  </div>
                  <StatusBadge status={lead.status} />
                </div>
                <p className="mt-3 text-sm text-slate-700">{lead.requirement || "Requirement pending"}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => setSelected(lead)}>View</button>
                  <button className="btn-secondary" onClick={() => addNote(lead._id)}>Add Note</button>
                  <button className="btn-secondary" onClick={() => callAgain(lead._id)}>Call Again</button>
                </div>
              </article>
            ))}
          </div>
          <div className="desktop-table card overflow-hidden p-0">
            <div className="table-wrap">
              <table className="table w-full min-w-[1200px]">
                <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Requirement</th><th>Preferred</th><th>Source</th><th>Agent</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead._id}>
                      <td className="break-anywhere">{lead.name || "Unknown"}</td>
                      <td className="break-anywhere">{lead.phone || "-"}</td>
                      <td className="break-anywhere">{lead.email || "-"}</td>
                      <td className="break-anywhere">{lead.requirement || "-"}</td>
                      <td>{[lead.preferredDate, lead.preferredTime].filter(Boolean).join(" ") || "-"}</td>
                      <td>{lead.source || "-"}</td>
                      <td>{lead.agentId?.agentName || "Agent"}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={lead.status} />
                          <select value={lead.status} onChange={(event) => updateStatus(lead._id, event.target.value)} className="w-40">
                            {statuses.map((status) => <option key={status}>{status}</option>)}
                          </select>
                        </div>
                      </td>
                      <td>{new Date(lead.createdAt).toLocaleDateString()}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-xl border border-slate-200 p-2" title="View" onClick={() => setSelected(lead)}><UserRound size={16} /></button>
                          <button className="rounded-xl border border-slate-200 p-2" title="Add note" onClick={() => addNote(lead._id)}><FileText size={16} /></button>
                          {lead.callLogId?.transcriptUrl && <a className="rounded-xl border border-slate-200 p-2" title="View transcript" href={lead.callLogId.transcriptUrl} target="_blank"><FileText size={16} /></a>}
                          <button className="rounded-xl border border-slate-200 p-2" title="Call again" onClick={() => callAgain(lead._id)}><PhoneCall size={16} /></button>
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

      {selected && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-950">Lead Detail</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Info label="Name" value={selected.name} />
              <Info label="Phone" value={selected.phone} />
              <Info label="Email" value={selected.email} />
              <Info label="Requirement" value={selected.requirement} />
              <Info label="Preferred Date" value={selected.preferredDate} />
              <Info label="Preferred Time" value={selected.preferredTime} />
              <Info label="Source" value={selected.source} />
              <Info label="Agent" value={selected.agentId?.agentName} />
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200 p-4">
              <p className="mb-2 font-semibold text-slate-950">Notes timeline</p>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">{JSON.stringify(selected.notes || [], null, 2)}</pre>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => addNote(selected._id)}>Add Note</button>
              <button className="btn-primary" onClick={() => callAgain(selected._id)}>Call Again</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Info({ label, value }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="break-anywhere text-sm font-semibold text-slate-950">{value || "Not provided"}</p></div>;
}
