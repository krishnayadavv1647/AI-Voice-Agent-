import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const statuses = ["New", "Contacted", "Interested", "Closed", "Not Interested"];

export default function Leads() {
  const [leads, setLeads] = useState([]);

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
      <PageHeader title="Leads" description="Track captured leads and update follow-up status." action={<button className="btn-secondary" onClick={exportCsv}><Download size={16} />Export CSV</button>} />
      <div className="card overflow-hidden p-0">
        <table className="table w-full min-w-[920px]">
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Requirement</th><th>Agent</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead._id}>
                <td>{lead.name || "Unknown"}</td>
                <td>{lead.phone || "-"}</td>
                <td>{lead.email || "-"}</td>
                <td>{lead.requirement || "-"}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
