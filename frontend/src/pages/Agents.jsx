import { Eye, Pause, PhoneCall, Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

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
    await api(type === "delete" ? `/agents/${id}` : `/agents/${id}/${type}`, { method: type === "delete" ? "DELETE" : "POST" });
    load();
  }

  return (
    <>
      <PageHeader title="My Agents" description="Manage, call, publish, pause, and delete your agents." action={<Link className="btn-primary" to="/create-agent">Create Agent</Link>} />
      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {!agents.length ? (
        <EmptyState title="No agents created" description="Create an agent wizard draft and publish it when ready." action={<Link className="btn-primary" to="/create-agent">Create Agent</Link>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {agents.map((agent) => (
            <div className="card" key={agent._id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-ink">{agent.agentName}</h2>
                  <p className="text-sm text-slate-500">{agent.agentType} - {agent.businessName}</p>
                </div>
                <StatusBadge status={agent.status} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><p className="text-slate-500">Language</p><p className="font-semibold">{agent.language}</p></div>
                <div><p className="text-slate-500">Calls</p><p className="font-semibold">{agent.totalCalls}</p></div>
                <div><p className="text-slate-500">Leads</p><p className="font-semibold">{agent.totalLeads}</p></div>
                <div><p className="text-slate-500">Created</p><p className="font-semibold">{new Date(agent.createdAt).toLocaleDateString()}</p></div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link title="View" className="btn-secondary" to={`/agents/${agent._id}`}><Eye size={16} />View</Link>
                <Link title="Test Call" className="btn-secondary" to={`/agents/${agent._id}/test`}><PhoneCall size={16} />Test Call</Link>
                <button title="Publish" className="btn-secondary" onClick={() => action(agent._id, "publish")}><Play size={16} />Publish</button>
                <button title="Pause" className="btn-secondary" onClick={() => action(agent._id, "pause")}><Pause size={16} />Pause</button>
                <button title="Delete" className="btn-secondary text-rose-600" onClick={() => action(agent._id, "delete")}><Trash2 size={16} />Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
