import { Clock, Plus, TrendingDown, TrendingUp, Users, WalletCards } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import EmptyState from "../components/EmptyState.jsx";
import PageLoader from "../components/PageLoader.jsx";
import Section from "../components/Section.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import dashboardBannerBackground from "../assets/dashboard-waveform-banner.png";
import dashboardCallingAgent from "../assets/dashboard-calling-agent-2-cutout.png";
import dashboardIconPhone from "../assets/dashboard-icon-phone-cutout.png";
import dashboardIconPulse from "../assets/dashboard-icon-pulse-cutout.png";
import dashboardIconRobot from "../assets/dashboard-icon-robot-cutout.png";
import dashboardIconTarget from "../assets/dashboard-icon-target-cutout.png";
import { api } from "../lib/api.js";

function durationLabel(call) {
  if (typeof call?.durationSeconds === "number") return `${call.durationSeconds}s`;
  return call?.duration || "Pending";
}

function DashboardBanner() {
  return (
    <section className="dashboard-banner" aria-label="Dashboard visual summary">
      <div className="dashboard-banner-card">
        <img src={dashboardBannerBackground} alt="" aria-hidden="true" className="dashboard-banner-image" />
        <div className="dashboard-banner-content">
          <h1 className="page-title title1">Turn Leads Into Calls, Campaigns & Sales</h1>
          <p className="page-description paragraph1">Find leads, send campaigns, schedule calls, and convert faster.</p>
          <div className="dashboard-header-actions">
            <button className="btn-secondary" type="button">Last 30 days</button>
            <Link to="/create-agent" className="btn-primary"><Plus size={18} />Create Agent</Link>
          </div>
        </div>
      </div>
      <img src={dashboardCallingAgent} alt="" aria-hidden="true" className="dashboard-calling-agent-image" />
    </section>
  );
}

export default function Dashboard() {
  const { data, error: queryError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api("/dashboard")
  });
  const error = queryError?.message || "";

  const stats = data?.stats || {};
  const activeAgents = stats.activeAgents || 0;
  const totalAgents = stats.totalAgents || 0;
  const totalCalls = stats.totalCalls || 0;
  const totalLeads = stats.totalLeads || 0;
  const outboundCallVolume = data?.outboundCallVolume || [];
  const maxOutboundCalls = Math.max(1, ...outboundCallVolume.map((item) => item.count || 0));
  const hasOutboundCalls = outboundCallVolume.some((item) => item.count > 0);

  const successRate = useMemo(() => {
    if (!totalCalls) return 0;
    return Math.min(100, Math.round(((totalCalls - (stats.failedCalls || 0)) / totalCalls) * 100));
  }, [totalCalls, stats.failedCalls]);

  const cards = [
    { label: "Total Agents", value: totalAgents, icon: dashboardIconRobot, trend: "+12%" },
    { label: "Active Agents", value: activeAgents, icon: dashboardIconPulse, trend: "+8%" },
    { label: "Total Calls", value: totalCalls, icon: dashboardIconPhone, trend: "+23%" },
    { label: "Success Rate", value: `${successRate}%`, icon: dashboardIconTarget, trend: "+4%" }
  ];

  return (
    <div className="page-stack">
      <DashboardBanner />

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {!data ? (
        <PageLoader label="Loading dashboard" />
      ) : (
        <>
          <Section title="Overview" description="The four numbers that best describe current account activity.">
            <div className="summary-grid">
              {cards.map(({ label, value, icon, trend }) => (
                <div className="dashboard-stat-card" key={label}>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="dashboard-stat-icon">
                      <img src={icon} alt="" aria-hidden="true" className="dashboard-stat-icon-image" />
                    </div>
                    <span className="dashboard-stat-trend">
                      <TrendingUp size={12} />
                      {trend}
                    </span>
                  </div>
                  <p className="dashboard-stat-label">{label}</p>
                  <p className="dashboard-stat-value">{value}</p>
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
              <div className="relative flex h-52 min-w-0 items-end gap-1 rounded-2xl bg-neutral-50 p-3 sm:h-64 sm:gap-2 sm:p-4">
                {outboundCallVolume.map((item) => {
                  const height = item.count ? Math.max(10, Math.round((item.count / maxOutboundCalls) * 100)) : 2;
                  return (
                    <div key={item.key} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                      <div className="flex h-full w-full items-end">
                        <div
                          className="w-full rounded-t-xl border border-[#c8ff2e]/30 bg-[linear-gradient(180deg,#d9ff5a_0%,#7dff4a_100%)] shadow-[0_0_18px_rgba(200,255,46,.22)] transition group-hover:brightness-110"
                          style={{ height: `${height}%`, opacity: item.count ? 1 : 0.28 }}
                          title={`${item.count} outbound call${item.count === 1 ? "" : "s"} on ${item.label}`}
                        />
                      </div>
                      <span className="hidden max-w-full truncate text-[10px] text-neutral-500 sm:block">{item.label}</span>
                    </div>
                  );
                })}
                {!hasOutboundCalls && (
                  <div className="absolute inset-0 grid place-items-center p-6 text-center">
                    <p className="rounded-xl border border-hairline bg-black/20 px-4 py-3 text-sm text-neutral-500">
                      No outbound calls in the last 12 days.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="card min-w-0">
              <h2 className="panel-title">Lead Status</h2>
              <p className="muted">CRM snapshot from captured conversations</p>
              <div className="my-6 grid place-items-center">
                <div className="grid h-44 w-44 place-items-center rounded-full bg-[conic-gradient(#13706d_0_38%,#45b95a_38%_62%,#63d865_62%_82%,#85ec75_82%_100%)]">
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
