import { Activity, Bot, Clock, PhoneCall, Plus, Target, TrendingDown, TrendingUp, Users, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import Section from "../components/Section.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const chartBars = [28, 44, 36, 62, 48, 74, 69, 86, 58, 92, 78, 96];

function durationLabel(call) {
  if (typeof call?.durationSeconds === "number") return `${call.durationSeconds}s`;
  return call?.duration || "Pending";
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard").then(setData).catch((err) => setError(err.message));
  }, []);

  const stats = data?.stats || {};
  const activeAgents = stats.activeAgents || 0;
  const totalAgents = stats.totalAgents || 0;
  const totalCalls = stats.totalCalls || 0;
  const totalLeads = stats.totalLeads || 0;

  const successRate = useMemo(() => {
    if (!totalCalls) return 0;
    return Math.min(100, Math.round(((totalCalls - (stats.failedCalls || 0)) / totalCalls) * 100));
  }, [totalCalls, stats.failedCalls]);

  const cards = [
    { label: "Total Agents", value: totalAgents, icon: Bot, trend: "+12%", tone: "blue" },
    { label: "Active Agents", value: activeAgents, icon: Activity, trend: "+8%", tone: "green" },
    { label: "Total Calls", value: totalCalls, icon: PhoneCall, trend: "+23%", tone: "purple" },
    { label: "Success Rate", value: `${successRate}%`, icon: Target, trend: "+4%", tone: "green" }
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title="Dashboard"
        description="Monitor outbound AI calls, lead capture, Dograh workflow health, and agent performance from one control room."
        action={
          <>
            <button className="btn-secondary" type="button">Last 30 days</button>
            <Link to="/create-agent" className="btn-primary"><Plus size={18} />Create Agent</Link>
          </>
        }
      />

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {!data ? (
        <div className="summary-grid">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton h-32" />)}
        </div>
      ) : (
        <>
          <Section title="Overview" description="The four numbers that best describe current account activity.">
            <div className="summary-grid">
              {cards.map(({ label, value, icon: Icon, trend, tone }) => (
                <div className="metric-card" key={label}>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className={`grid h-11 w-11 place-items-center rounded-xl ${
                      tone === "green" ? "bg-emerald-50 text-emerald-700" :
                      tone === "purple" ? "bg-violet-50 text-violet-700" :
                      tone === "red" ? "bg-rose-50 text-rose-700" : "bg-brand-50 text-brand-700"
                    }`}>
                      <Icon size={18} />
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-600">
                      <TrendingUp size={12} />
                      {trend}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-neutral-500">{label}</p>
                  <p className="mt-2 break-anywhere text-2xl font-semibold leading-8 text-ink">{value}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Call Activity" description="Volume and lead outcomes for the selected date range.">
          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <section className="card min-w-0">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="panel-title">Call Volume</h2>
                  <p className="muted">Outbound calls over the last 12 periods</p>
                </div>
                <StatusBadge status="Active" />
              </div>
              <div className="flex h-52 min-w-0 items-end gap-1 rounded-2xl bg-neutral-50 p-3 sm:h-64 sm:gap-2 sm:p-4">
                {chartBars.map((height, index) => (
                  <div key={index} className="flex min-w-0 flex-1 items-end">
                    <div
                      className="w-full rounded-t-xl bg-brand-600"
                      style={{ height: `${height}%` }}
                      title={`${height} calls`}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="card min-w-0">
              <h2 className="panel-title">Lead Status</h2>
              <p className="muted">CRM snapshot from captured conversations</p>
              <div className="my-6 grid place-items-center">
                <div className="grid h-44 w-44 place-items-center rounded-full bg-[conic-gradient(#2563eb_0_38%,#7c3aed_38%_62%,#10b981_62%_82%,#f59e0b_82%_100%)]">
                  <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center">
                    <div>
                      <p className="text-3xl font-semibold text-ink">{totalLeads}</p>
                      <p className="text-xs text-neutral-500">Leads</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {["New", "Contacted", "Interested", "Booked"].map((status) => (
                  <div key={status} className="rounded-xl bg-neutral-50 p-3">
                    <StatusBadge status={status} />
                  </div>
                ))}
              </div>
            </section>
          </div>
          </Section>

          <Section title="Recent Calls" description="Latest call records with agent and duration context." action={<Link className="btn-secondary" to="/calls">View all calls</Link>}>
            <div className="card table-wrap p-0">
              <table className="table w-full min-w-[680px]">
                <thead>
                  <tr>
                    <th>Caller</th>
                    <th>Agent</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentCalls || []).slice(0, 6).map((call) => (
                    <tr key={call._id}>
                      <td>{call.callerNumber || "Unknown caller"}</td>
                      <td>{call.agentId?.agentName || "Agent"}</td>
                      <td>{durationLabel(call)}</td>
                      <td><StatusBadge status={call.status || "Logged"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data && !data.recentCalls?.length && <div className="p-6"><EmptyState title="No calls yet" description="Start a test call to see call logs." /></div>}
            </div>
          </Section>

          <Section title="Needs Attention" description="Agent and lead activity that may require follow-up.">
          <div className="grid min-w-0 gap-6 xl:grid-cols-2">
            <section className="card min-w-0">
              <h2 className="mb-4 panel-title">Agents Requiring Attention</h2>
              {!data?.recentAgents?.length ? (
                <EmptyState title="No agents yet" description="Create your first AI voice agent." />
              ) : (
                <div className="space-y-3">
                  {data.recentAgents.slice(0, 5).map((agent) => (
                    <Link key={agent._id} to={`/agents/${agent._id}`} className="block rounded-2xl border border-hairline p-3 transition hover:border-brand-200 hover:bg-brand-50/40">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{agent.agentName}</p>
                          <p className="truncate text-sm text-neutral-500">{agent.businessName}</p>
                        </div>
                        <StatusBadge status={agent.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="card min-w-0">
              <h2 className="mb-4 panel-title">Recent Leads</h2>
              <div className="space-y-3">
                {(data?.recentLeads || []).map((lead) => (
                  <div key={lead._id} className="rounded-2xl border border-hairline p-3">
                    <p className="break-anywhere font-semibold text-ink">{lead.name || lead.phone || "New lead"}</p>
                    <p className="line-clamp-2 text-sm text-neutral-500">{lead.requirement || "Requirement pending"}</p>
                  </div>
                ))}
                {data && !data.recentLeads?.length && <EmptyState title="No leads captured yet" description="Leads will appear after calls or messages." />}
              </div>
            </section>
          </div>
          </Section>
        </>
      )}
    </div>
  );
}
