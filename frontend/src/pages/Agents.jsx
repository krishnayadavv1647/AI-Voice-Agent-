import { Edit, Eye, Link2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import dashboardCallingAgent from "../assets/dashboard-calling-agent-2.png";
import EmptyState from "../components/EmptyState.jsx";
import { api, assetUrl } from "../lib/api.js";

function requestMessage(err, fallback = "Request failed.") {
  return err.response?.message || err.message || fallback;
}

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [generatingId, setGeneratingId] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((agent) =>
      [agent.agentName, agent.businessName, agent.businessCategory, agent.status, agent.language]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [agents, search]);

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
      setError(requestMessage(err));
    }
  }

  async function copyAgentLink(agent) {
    const url = `${window.location.origin}/a/${agent.publicSlug}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(agent._id);
    window.setTimeout(() => setCopiedId(null), 1500);
  }

  async function regenerateImage(id) {
    setError("");
    setToast("");
    setGeneratingId(id);
    try {
      const result = await api(`/agents/${id}/generate-image`, { method: "POST" });
      if (result?.fallbackUsed || result?.success === false) {
        setToast(result.message || "Image generation failed. Default avatar used.");
        window.setTimeout(() => setToast(""), 4000);
      }
      await load();
    } catch (err) {
      console.warn(requestMessage(err, "Image generation failed. Default avatar used."));
      setToast("Image generation failed. Default avatar used.");
      window.setTimeout(() => setToast(""), 4000);
    } finally {
      setGeneratingId("");
    }
  }

  function initials(agent) {
    const name = agent.agentName || agent.name || agent.businessName || "AI";
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "AI";
  }

  function cardImage(agent, index) {
    if (agent.imageUrl) return assetUrl(agent.imageUrl);
    return index === 0 ? dashboardCallingAgent : "";
  }

  return (
    <div className="agents-library-page">
      <div className="agents-library-header">
        <div>
          <h1>Agent Library</h1>
          <p>Open, edit, test, or archive each agent from one consistent list.</p>
        </div>
        <Link className="agents-library-create" to="/create-agent" title="Create agent">
          <Plus size={16} />
          <span>Create</span>
        </Link>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {toast && <div className="agent-toast" role="status">{toast}</div>}

      <div className="relative mb-2">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          className="pl-9"
          style={{ height: 40, minHeight: 40 }}
          placeholder="Search agents by name, category, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!agents.length ? (
        <EmptyState
          title="No agents yet. Create your first AI voice agent."
          description="Choose a template, add business knowledge, and launch outbound AI calls through Dograh."
          action={<Link className="agents-library-create" to="/create-agent"><Plus size={16} />Create</Link>}
        />
      ) : (
        {!filteredAgents.length && <p className="py-8 text-center text-sm text-neutral-500">No agents found for your search.</p>}
        <div className="agent-card-grid">
          {filteredAgents.map((agent, index) => (
            <article
              className={`agent-card ${agent.imageUrl || index === 0 ? "agent-card-has-image" : ""} ${generatingId === agent._id ? "agent-card-generating" : ""}`}
              key={agent._id}
              style={{ "--agent-card-image": `url("${cardImage(agent, index)}")` }}
            >
              {!agent.imageUrl && index !== 0 && <div className="agent-card-fallback" aria-hidden="true">{initials(agent)}</div>}
              <button title="Delete" className="agent-card-delete" onClick={() => action(agent._id, "delete")} type="button">
                <Trash2 size={14} />
              </button>
              <Link className="agent-card-edit" title="Edit" to={`/agents/${agent._id}/edit`}>
                <Edit size={13} />
                <span>Edit</span>
              </Link>

              <div className="agent-actions" aria-label={`Actions for ${agent.agentName || "agent"}`}>
                <Link title="View" to={`/agents/${agent._id}`}>
                  <Eye size={13} />
                  <span>View</span>
                </Link>
                <button title="Regenerate Image" type="button" onClick={() => regenerateImage(agent._id)} disabled={generatingId === agent._id}>
                  <RefreshCw size={13} />
                  <span>{generatingId === agent._id ? "Generating" : "AI Gen"}</span>
                </button>
                <button
                  type="button"
                  disabled={!agent.publicSlug}
                  title={agent.publicSlug ? "Copy public link" : "Publish agent first to get a shareable link"}
                  onClick={() => copyAgentLink(agent)}
                >
                  <Link2 size={13} />
                  <span>{copiedId === agent._id ? "Copied!" : "Share"}</span>
                </button>
              </div>

              <div className="agent-card-content">
                <h2>{agent.agentName || "AI Sales Calling Agent"}</h2>
                <p>{agent.businessName || "Automate sales calls, follow-ups, lead outreach, & appointment booking with one smart AI calling agent."}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
