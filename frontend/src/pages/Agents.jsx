import { Bot, Edit, Eye, MessageSquare, PhoneCall, Plus, RadioTower, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

function lastCall(agent) {
  return agent.lastCallAt ? new Date(agent.lastCallAt).toLocaleString() : "No calls yet";
}

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      setAgents(await api("/agents"));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function action(id, type) {
    if (type === "delete" && !confirm("Delete this agent?")) return;
    setError("");
    try {
      await api(type === "delete" ? `/agents/${id}` : `/agents/${id}/${type}`, { method: type === "delete" ? "DELETE" : "POST" });
      load();
    } catch (err) {
      setError(err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message);
    }
  }

  return (
    <>
      <PageHeader
        title="Agents"
        description="Manage outbound AI calling agents, Dograh workflow status, language, calls, and lead capture."
        action={<Link className="btn-primary" to="/create-agent"><Plus size={16} />Create Agent</Link>}
      />
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {!agents.length ? (
        <EmptyState title="No agents yet. Create your first AI voice agent." description="Choose a template, add business knowledge, and launch outbound AI calls through Dograh." action={<Link className="btn-primary" to="/create-agent">Create Agent</Link>} />
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {agents.map((agent) => (
            <article className="card min-w-0 transition hover:-translate-y-0.5 hover:shadow-xl" key={agent._id}>
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3">
                  <div className="icon-tile">
                    <Bot size={20} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="break-anywhere text-lg font-bold text-slate-950">{agent.agentName}</h2>
                    <p className="break-anywhere text-sm text-slate-500">{agent.businessName}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">{agent.businessCategory || agent.agentType}</p>
                  </div>
                </div>
                <StatusBadge status={agent.status} />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <MiniStat label="Language" value={agent.language || "English"} />
                <MiniStat label="Calls" value={agent.totalCalls || 0} />
                <MiniStat label="Leads" value={agent.totalLeads || 0} />
                <MiniStat label="Last Call" value={lastCall(agent)} />
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <RadioTower size={16} className="shrink-0 text-brand-700" />
                  <span className="font-semibold text-slate-700">Dograh workflow</span>
                  <span className="ml-auto shrink-0"><StatusBadge status={agent.dograhStatus || (agent.dograhWorkflowUuid ? "Connected" : "Draft")} /></span>
                </div>
                <p className="mt-2 break-anywhere text-xs text-slate-500">{agent.dograhWorkflowUuid || "Workflow UUID not connected yet"}</p>
              </div>

              <div className="mt-5 action-row">
                <Link title="View" className="btn-secondary" to={`/agents/${agent._id}`}><Eye size={16} />View</Link>
                <Link title="Edit" className="btn-secondary" to={`/agents/${agent._id}/edit`}><Edit size={16} />Edit</Link>
                <Link title="Test Call" className="btn-secondary" to={`/agents/${agent._id}/test`}><PhoneCall size={16} />Test Call</Link>
                <Link title="Message Test" className="btn-secondary" to={`/agents/${agent._id}#message-test`}><MessageSquare size={16} />Message Test</Link>
                <button title="Delete" className="btn-danger" onClick={() => action(agent._id, "delete")}><Trash2 size={16} />Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="break-anywhere text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}
