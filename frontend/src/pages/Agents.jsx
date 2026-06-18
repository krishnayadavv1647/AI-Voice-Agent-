import { Edit, Eye, MessageSquare, PhoneCall, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import Section from "../components/Section.jsx";
import { api } from "../lib/api.js";

function lastCall(agent) {
  return agent.lastCallAt ? new Date(agent.lastCallAt).toLocaleString() : "No calls yet";
}

function scenarioCount(agent) {
  return agent.scenarioCount ?? agent.totalScenarios ?? agent.scenarios?.length ?? 0;
}

function statusText(agent) {
  return agent.dograhStatus || agent.status || "Draft";
}

function isEnabled(agent) {
  return ["active", "connected"].includes(String(statusText(agent)).toLowerCase());
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
    <div className="page-stack">
      <PageHeader
        title="Agents"
        description="Manage outbound AI calling agents, Dograh workflow status, language, calls, and lead capture."
        action={<Link className="btn-primary" to="/create-agent"><Plus size={16} />Create Agent</Link>}
      />
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {!agents.length ? (
        <EmptyState title="No agents yet. Create your first AI voice agent." description="Choose a template, add business knowledge, and launch outbound AI calls through Dograh." action={<Link className="btn-primary" to="/create-agent">Create Agent</Link>} />
      ) : (
        <>
          <Section title="Agent Overview" description="Current fleet health across calling, leads, and workflow connectivity.">
            <div className="summary-grid">
              <MiniStat label="Total Agents" value={agents.length} />
              <MiniStat label="Active Agents" value={agents.filter((agent) => String(agent.status).toLowerCase() === "active").length} />
              <MiniStat label="Total Calls" value={agents.reduce((sum, agent) => sum + Number(agent.totalCalls || 0), 0)} />
              <MiniStat label="Total Leads" value={agents.reduce((sum, agent) => sum + Number(agent.totalLeads || 0), 0)} />
            </div>
          </Section>

          <Section title="Agent Library" description="Open, edit, test, or archive each agent from one consistent list.">
            <div className="agent-card-grid">
              {agents.map((agent) => (
                <article className="agent-card" key={agent._id}>
                  <div className="agent-card-body">
                    <div className="agent-card-header">
                      <div className="agent-card-heading">
                        <h2 className="agent-card-title">{agent.agentName || "Untitled agent"}</h2>
                        <p className="agent-card-business">{agent.businessName || "No business name"}</p>
                        <p className="agent-card-category">{agent.businessCategory || agent.agentType || "General"}</p>
                      </div>
                      <AgentStatusBadge status={statusText(agent)} />
                    </div>

                    <div className="agent-card-divider" />

                    <dl className="agent-info-list">
                      <InfoRow label="Language" value={agent.language || "English"} />
                      <InfoRow label="Leads" value={agent.totalLeads || 0} />
                      <InfoRow label="Last Call" value={lastCall(agent)} />
                    </dl>

                    <div className="agent-card-divider" />

                    <div className="connected-app-row">
                      <span>Connected App</span>
                      <DograhIntegrationBadge />
                    </div>

                    <div className="agent-actions" aria-label={`Actions for ${agent.agentName || "agent"}`}>
                      <Link title="View" className="btn-secondary" to={`/agents/${agent._id}`}><Eye size={16} />View</Link>
                      <Link title="Edit" className="btn-secondary" to={`/agents/${agent._id}/edit`}><Edit size={16} />Edit</Link>
                      <Link title="Test Call" className="btn-secondary" to={`/agents/${agent._id}/test`}><PhoneCall size={16} />Test</Link>
                      <Link title="Message Test" className="btn-secondary" to={`/agents/${agent._id}#message-test`}><MessageSquare size={16} />Message</Link>
                      <button title="Delete" className="btn-danger" onClick={() => action(agent._id, "delete")}><Trash2 size={16} />Delete</button>
                    </div>
                  </div>

                  <div className="agent-card-footer">
                    <span className="agent-scenarios">Scenarios: <strong>{scenarioCount(agent)}</strong></span>
                    <div className="agent-toggle-group">
                      <span className="agent-footer-status">{statusText(agent)}</span>
                      <AgentStatusToggle
                        checked={isEnabled(agent)}
                        label={`Toggle ${agent.agentName || "agent"} status`}
                        onClick={() => action(agent._id, isEnabled(agent) ? "pause" : "activate")}
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="break-anywhere text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="agent-info-row">
      <dt>{label}</dt>
      <dd title={String(value)}>{value}</dd>
    </div>
  );
}

function AgentStatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();
  const tone = normalized === "draft" ? "draft" : ["active", "connected"].includes(normalized) ? "active" : "neutral";
  return <span className={`agent-status-badge agent-status-badge-${tone}`}>{status || "Unknown"}</span>;
}

function DograhIntegrationBadge() {
  return (
    <span className="dograh-integration-badge" aria-label="Dograh connected application" role="img">
      <span className="dograh-integration-mark">D</span>
      <span className="dograh-connected-dot" />
    </span>
  );
}

function AgentStatusToggle({ checked, label, onClick }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`agent-status-toggle ${checked ? "agent-status-toggle-on" : ""}`}
      onClick={onClick}
      role="switch"
      type="button"
    >
      <span />
    </button>
  );
}
