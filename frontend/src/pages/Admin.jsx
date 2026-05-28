import { Bot, Clock, PhoneCall, Users } from "lucide-react";
import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [calls, setCalls] = useState([]);
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    Promise.all([api("/admin/stats"), api("/admin/users"), api("/admin/agents"), api("/admin/calls"), api("/admin/leads")]).then(([s, u, a, c, l]) => {
      setStats(s);
      setUsers(u);
      setAgents(a);
      setCalls(c);
      setLeads(l);
    });
  }, []);

  const cards = [
    ["Total Users", stats?.totalUsers || 0, Users],
    ["Total Agents", stats?.totalAgents || 0, Bot],
    ["Active Agents", stats?.activeAgents || 0, Bot],
    ["Total Calls", stats?.totalCalls || 0, PhoneCall],
    ["Total Leads", stats?.totalLeads || 0, Users],
    ["Minutes Used", stats?.totalMinutesUsed || 0, Clock]
  ];

  return (
    <>
      <PageHeader title="Admin" description="System-wide users, agents, calls, leads, usage, and logs." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map(([label, value, Icon]) => (
          <div key={label} className="card">
            <Icon className="mb-4 text-brand-700" size={18} />
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminList title="Users" items={users.map((user) => `${user.name} · ${user.email} · ${user.status}`)} />
        <div className="card">
          <h2 className="mb-3 font-bold text-ink">Agents</h2>
          <div className="space-y-2">
            {agents.map((agent) => (
              <div key={agent._id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-sm">
                <span>{agent.agentName} · {agent.userId?.email}</span>
                <StatusBadge status={agent.status} />
              </div>
            ))}
          </div>
        </div>
        <AdminList title="Calls" items={calls.map((call) => `${call.callerNumber || "Unknown"} · ${call.agentId?.agentName || "Agent"} · ${call.status || "Logged"}`)} />
        <AdminList title="Leads" items={leads.map((lead) => `${lead.name || lead.phone || "Lead"} · ${lead.agentId?.agentName || "Agent"} · ${lead.status}`)} />
      </div>
    </>
  );
}

function AdminList({ title, items }) {
  return (
    <div className="card">
      <h2 className="mb-3 font-bold text-ink">{title}</h2>
      <div className="space-y-2">
        {items.map((item, index) => <p key={`${item}-${index}`} className="rounded-lg border border-slate-100 p-3 text-sm text-slate-700">{item}</p>)}
        {!items.length && <p className="text-sm text-slate-500">No records yet.</p>}
      </div>
    </div>
  );
}
