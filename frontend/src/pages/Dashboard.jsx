import { Bot, Clock, PhoneCall, Plus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const statIcons = [Bot, Bot, PhoneCall, Users, Clock];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard").then(setData).catch((err) => setError(err.message));
  }, []);

  const stats = data?.stats || {};
  const cards = [
    ["Total Agents", stats.totalAgents || 0],
    ["Active Agents", stats.activeAgents || 0],
    ["Total Calls", stats.totalCalls || 0],
    ["Total Leads", stats.totalLeads || 0],
    ["Minutes Used", stats.minutesUsed || 0]
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your voice agent control room."
        action={<Link to="/create-agent" className="btn-primary"><Plus size={18} />Create New Agent</Link>}
      />
      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value], index) => {
          const Icon = statIcons[index];
          return (
            <div className="card" key={label}>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <Icon size={18} />
              </div>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="card xl:col-span-1">
          <h2 className="mb-4 font-bold text-ink">Recent agents</h2>
          {!data?.recentAgents?.length ? (
            <EmptyState title="No agents yet" description="Create your first AI voice agent to see it here." />
          ) : (
            <div className="space-y-3">
              {data.recentAgents.map((agent) => (
                <Link key={agent._id} to={`/agents/${agent._id}`} className="block rounded-lg border border-slate-100 p-3 hover:border-brand-200">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-ink">{agent.agentName}</p>
                    <StatusBadge status={agent.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{agent.businessName}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card xl:col-span-1">
          <h2 className="mb-4 font-bold text-ink">Recent call logs</h2>
          <div className="space-y-3">
            {(data?.recentCalls || []).map((call) => (
              <div key={call._id} className="rounded-lg border border-slate-100 p-3">
                <p className="font-semibold text-ink">{call.callerNumber || "Unknown caller"}</p>
                <p className="text-sm text-slate-500">{call.agentId?.agentName || "Agent"} · {call.duration || 0}s</p>
              </div>
            ))}
            {data && !data.recentCalls?.length && <EmptyState title="No calls yet" />}
          </div>
        </section>

        <section className="card xl:col-span-1">
          <h2 className="mb-4 font-bold text-ink">Recent leads</h2>
          <div className="space-y-3">
            {(data?.recentLeads || []).map((lead) => (
              <div key={lead._id} className="rounded-lg border border-slate-100 p-3">
                <p className="font-semibold text-ink">{lead.name || lead.phone || "New lead"}</p>
                <p className="text-sm text-slate-500">{lead.requirement || "Requirement pending"}</p>
              </div>
            ))}
            {data && !data.recentLeads?.length && <EmptyState title="No leads yet" />}
          </div>
        </section>
      </div>
    </>
  );
}
