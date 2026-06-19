import {
  Activity,
  Bot,
  CalendarClock,
  CreditCard,
  Headphones,
  KeyRound,
  Mail,
  PhoneCall,
  RefreshCw,
  Search,
  Shield,
  UserCog,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api, setToken } from "../lib/api.js";

const tabs = [
  ["dashboard", "Admin Dashboard", Shield],
  ["users", "Users", Users],
  ["agents", "Agents", Bot],
  ["campaigns", "Campaigns", PhoneCall],
  ["calls", "Calls", PhoneCall],
  ["leads", "Leads", Users],
  ["appointments", "Appointments", CalendarClock],
  ["followups", "Follow-ups", CalendarClock],
  ["email", "Email Campaigns", Mail],
  ["usage", "Usage & Credits", CreditCard],
  ["plans", "Plans", CreditCard],
  ["integrations", "Integration Settings", KeyRound],
  ["audit", "Audit Logs", Activity]
];

function errorText(err) {
  return err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message;
}

function fmt(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function nameOf(record) {
  return record?.name || record?.businessName || record?.agentName || record?.title || record?.email || "Record";
}

export default function Admin() {
  const [active, setActive] = useState("dashboard");
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [resources, setResources] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [overviewData, usersData] = await Promise.all([api("/admin/overview"), api("/admin/users")]);
      setOverview(overviewData);
      setUsers(usersData);
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError(errorText(err));
    }
  }

  async function loadResource(key, path) {
    setError("");
    try {
      const rows = await api(path);
      setResources((current) => ({ ...current, [key]: rows }));
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const paths = {
      agents: "/admin/agents",
      campaigns: "/admin/campaigns",
      calls: "/admin/calls",
      leads: "/admin/leads",
      appointments: "/admin/appointments",
      followups: "/admin/followups",
      email: "/admin/email-campaigns",
      usage: "/admin/usage",
      plans: "/admin/usage",
      integrations: "/admin/settings/integrations",
      audit: "/admin/audit-logs"
    };
    if (paths[active] && !resources[active]) loadResource(active, paths[active]);
  }, [active]);

  const filteredUsers = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return users;
    return users.filter((user) => `${user.name} ${user.email} ${user.role} ${user.plan} ${user.status}`.toLowerCase().includes(value));
  }, [users, search]);

  async function mutate(message, fn) {
    setNotice("");
    setError("");
    try {
      const result = await fn();
      setNotice(message);
      await load();
      return result;
    } catch (err) {
      setError(errorText(err));
      return null;
    }
  }

  async function impersonate(user) {
    const result = await mutate(`Impersonating ${user.email}`, () => api(`/admin/users/${user._id}/impersonate`, { method: "POST" }));
    if (result?.token) {
      localStorage.setItem("admin_return_token", localStorage.getItem("ai_voice_agent_token") || "");
      setToken(result.token);
      window.location.href = "/dashboard";
    }
  }

  async function viewUser(user) {
    const detail = await api(`/admin/users/${user._id}`);
    const [agents, leads, calls, campaigns, appointments, followups, emailCampaigns, usage] = await Promise.all([
      api(`/admin/users/${user._id}/agents`),
      api(`/admin/users/${user._id}/leads`),
      api(`/admin/users/${user._id}/calls`),
      api(`/admin/users/${user._id}/campaigns`),
      api(`/admin/users/${user._id}/appointments`),
      api(`/admin/users/${user._id}/followups`),
      api(`/admin/users/${user._id}/email-campaigns`),
      api(`/admin/users/${user._id}/usage`)
    ]);
    setSelectedUser({ ...detail, tabs: { agents, leads, calls, campaigns, appointments, followups, emailCampaigns, usage } });
  }

  const cards = [
    ["Total Users", overview?.totalUsers || 0, Users],
    ["Active Users", overview?.activeUsers || 0, Users],
    ["Suspended", overview?.suspendedUsers || 0, UserCog],
    ["Total Agents", overview?.totalAgents || 0, Bot],
    ["Active Agents", overview?.activeAgents || 0, Bot],
    ["Total Calls", overview?.totalCalls || 0, PhoneCall],
    ["Completed Calls", overview?.completedCalls || 0, Headphones],
    ["Failed Calls", overview?.failedCalls || 0, Activity],
    ["Total Leads", overview?.totalLeads || 0, Users],
    ["Appointments", overview?.appointmentsBooked || 0, CalendarClock],
    ["Emails Sent", overview?.emailsSent || 0, Mail],
    ["Credits Used", overview?.creditsUsed || 0, CreditCard]
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title="Admin Control"
        description="Manage users, agents, calls, leads, appointments, email usage, credits, settings, and audit logs."
        action={<button className="btn-secondary" onClick={load}><RefreshCw size={16} />Refresh</button>}
      />
      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="card space-y-1">
          {tabs.map(([key, label, Icon]) => (
            <button key={key} className={active === key ? "tab-button tab-button-active w-full" : "tab-button w-full"} onClick={() => setActive(key)}>
              <Icon size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            </button>
          ))}
        </aside>

        <main className="min-w-0">
          {loading ? <div className="card text-sm text-neutral-500">Loading admin data...</div> : null}
          {active === "dashboard" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map(([label, value, Icon]) => (
                  <div key={label} className="card">
                    <Icon className="mb-4 text-brand-700" size={18} />
                    <p className="text-sm text-neutral-500">{label}</p>
                    <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <MiniList title="Top Users By Usage" rows={(overview?.topUsers || []).map((user) => `${user.name} - ${user.email} - ${user.minutesUsed || 0} min`)} />
                <MiniList title="Recent Activity" rows={(overview?.recentActivity || []).map((log) => `${log.action} - ${log.actorUserId?.email || "system"} - ${fmt(log.createdAt)}`)} />
              </div>
            </>
          )}

          {active === "users" && (
            <section className="card p-0">
              <div className="flex flex-wrap items-center gap-3 border-b border-hairline p-4">
                <div className="flex min-w-[16rem] flex-1 items-center gap-2 rounded-xl border border-hairline bg-white px-3">
                  <Search size={16} className="text-neutral-400" />
                  <input className="border-0 shadow-none focus:ring-0" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" />
                </div>
              </div>
              <AdminTable
                columns={["Name", "Email", "Role", "Status", "Plan", "Dograh", "Agents", "Calls", "Leads", "Emails", "Created", "Last Login", "Actions"]}
                rows={filteredUsers.map((user) => [
                  user.name,
                  user.email,
                  <StatusBadge status={user.role} />,
                  <StatusBadge status={user.status} />,
                  user.plan,
                  <StatusBadge status={user.dograhIntegration?.status || "not_connected"} />,
                  user.counts?.agents || 0,
                  user.counts?.calls || 0,
                  user.counts?.leads || 0,
                  user.counts?.emailsSent || 0,
                  fmt(user.createdAt),
                  fmt(user.lastLoginAt),
                  <div className="flex flex-nowrap items-center gap-2">
                    <button className="btn-secondary" onClick={() => viewUser(user)}>View</button>
                    <button className="btn-secondary" onClick={() => impersonate(user)}>Login As</button>
                    <button className="btn-secondary" onClick={() => mutate("User suspended", () => api(`/admin/users/${user._id}/suspend`, { method: "POST" }))}>Suspend</button>
                    <button className="btn-secondary" onClick={() => mutate("User activated", () => api(`/admin/users/${user._id}/activate`, { method: "POST" }))}>Activate</button>
                    <button className="btn-secondary" onClick={async () => {
                      const result = await mutate("Temporary password generated", () => api(`/admin/users/${user._id}/reset-password`, { method: "POST" }));
                      if (result?.temporaryPassword) alert(`Temporary password: ${result.temporaryPassword}`);
                    }}>Reset</button>
                    <button className="btn-danger" onClick={() => confirm("Soft delete this user?") && mutate("User deleted", () => api(`/admin/users/${user._id}`, { method: "DELETE" }))}>Delete</button>
                  </div>
                ])}
              />
            </section>
          )}

          {["agents", "campaigns", "calls", "leads", "appointments", "followups", "email"].includes(active) && (
            <ResourceTable keyName={active} rows={resources[active] || []} mutate={mutate} />
          )}

          {["usage", "plans"].includes(active) && (
            <UsageTable rows={resources[active] || []} mutate={mutate} />
          )}

          {active === "integrations" && <Integrations data={resources.integrations} />}
          {active === "audit" && <AuditTable rows={resources.audit || []} />}
        </main>
      </div>

      {selectedUser && <UserDetailModal detail={selectedUser} onClose={() => setSelectedUser(null)} mutate={mutate} />}
    </div>
  );
}

function MiniList({ title, rows }) {
  return <section className="card"><h2 className="font-semibold text-ink">{title}</h2><div className="mt-3 space-y-2">{rows.length ? rows.map((row, index) => <p key={index} className="rounded-xl border border-hairline p-3 text-sm text-neutral-700">{row}</p>) : <p className="text-sm text-neutral-500">No records yet.</p>}</div></section>;
}

function AdminTable({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table className="table w-full min-w-[1250px]">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => {
              const isActions = columns[cellIndex] === "Actions";
             return (
  <td
    key={cellIndex}
    className={
      isActions
        ? "whitespace-nowrap align-middle min-w-[280px]"
        : "break-words align-middle"
    }
  >
    {cell}
  </td>
);
            })}
          </tr>
        ))}</tbody>
      </table>
      {!rows.length && <div className="p-6 text-sm text-neutral-500">No records found.</div>}
    </div>
  );
}

function ResourceTable({ keyName, rows, mutate }) {
  const configs = {
    agents: ["Agent", ["Agent Name", "User", "Category", "Status", "Dograh", "Calls", "Leads", "Created", "Actions"], (row) => [row.agentName, row.userId?.email, row.businessCategory, <StatusBadge status={row.status} />, row.dograhStatus || "-", row.totalCalls || 0, row.totalLeads || 0, fmt(row.createdAt), <RowActions row={row} base="/admin/agents" mutate={mutate} pause activate />]],
    campaigns: ["Campaigns", ["Campaign", "User", "Agent", "Status", "Recipients", "Answered", "Failed", "Start", "Actions"], (row) => [row.name, row.userId?.email, row.agentId?.agentName, <StatusBadge status={row.status} />, row.stats?.totalRecipients || 0, row.stats?.answered || 0, row.stats?.failed || 0, fmt(row.startAt), <div className="flex min-w-max gap-2"><button className="btn-secondary" onClick={() => mutate("Campaign paused", () => api(`/campaigns/${row._id}/pause`, { method: "POST" }))}>Pause</button><button className="btn-danger" onClick={() => mutate("Campaign cancelled", () => api(`/campaigns/${row._id}/cancel`, { method: "POST" }))}>Cancel</button></div>]],
    calls: ["Calls", ["Date", "User", "Agent", "Caller", "Calling", "Status", "Outcome", "Duration", "Lead", "Actions"], (row) => [fmt(row.createdAt), row.userId?.email, row.agentId?.agentName, row.callerNumber, row.callingNumber, <StatusBadge status={row.normalizedStatus || row.status} />, row.outcome || "-", row.duration || row.durationSeconds || "-", row.leadId ? "Yes" : "No", <button className="btn-danger" onClick={() => mutate("Call deleted", () => api(`/admin/calls/${row._id}`, { method: "DELETE" }))}>Delete</button>]],
    leads: ["Leads", ["Lead", "User", "Agent", "Phone", "Email", "City", "Source", "Status", "Created", "Actions"], (row) => [nameOf(row), row.userId?.email, row.agentId?.agentName, row.phone, row.email, row.city, row.source, <StatusBadge status={row.status} />, fmt(row.createdAt), <button className="btn-danger" onClick={() => mutate("Lead deleted", () => api(`/admin/leads/${row._id}`, { method: "DELETE" }))}>Delete</button>]],
    appointments: ["Appointments", ["Lead", "User", "Agent", "Date & Time", "Phone", "Type", "Status", "Reminder", "Call Status", "Actions"], (row) => [nameOf(row.leadId), row.userId?.email, row.agentId?.agentName, fmt(row.startAt), row.customerPhone, row.appointmentType, <StatusBadge status={row.status} />, row.reminderStatus, row.appointmentCallStatus, <div className="flex min-w-max gap-2"><button className="btn-secondary" onClick={() => mutate("Appointment completed", () => api(`/admin/appointments/${row._id}/complete`, { method: "POST" }))}>Complete</button><button className="btn-danger" onClick={() => mutate("Appointment cancelled", () => api(`/admin/appointments/${row._id}/cancel`, { method: "POST" }))}>Cancel</button></div>]],
    followups: ["Follow-ups", ["Lead", "User", "Agent", "Type", "Trigger", "Scheduled", "Status", "Attempts", "Error", "Actions"], (row) => [nameOf(row.leadId), row.userId?.email, row.agentId?.agentName, row.type, row.trigger, fmt(row.scheduledAt), <StatusBadge status={row.status} />, `${row.attemptCount || 0}/${row.maxAttempts || 0}`, row.lastError || "-", <div className="flex min-w-max gap-2"><button className="btn-secondary" onClick={() => mutate("Follow-up queued", () => api(`/admin/followups/${row._id}/run`, { method: "POST" }))}>Run</button><button className="btn-danger" onClick={() => mutate("Follow-up cancelled", () => api(`/admin/followups/${row._id}/cancel`, { method: "POST" }))}>Cancel</button></div>]],
    email: ["Email Campaigns", ["Campaign", "User", "Agent", "Status", "Recipients", "Sent", "Failed", "Created", "Actions"], (row) => [row.name, row.userId?.email, row.agentId?.agentName, <StatusBadge status={row.status} />, row.totalRecipients || 0, row.sentCount || 0, row.failedCount || 0, fmt(row.createdAt), "-"]]
  };
  const [title, columns, mapper] = configs[keyName];
  return <section className="card p-0"><div className="border-b border-hairline p-4"><h2 className="font-semibold text-ink">{title}</h2></div><AdminTable columns={columns} rows={rows.map(mapper)} /></section>;
}

function RowActions({ row, base, mutate, pause, activate }) {
  return <div className="flex min-w-max gap-2">{pause && <button className="btn-secondary" onClick={() => mutate("Agent paused", () => api(`${base}/${row._id}/pause`, { method: "POST" }))}>Pause</button>}{activate && <button className="btn-secondary" onClick={() => mutate("Agent activated", () => api(`${base}/${row._id}/activate`, { method: "POST" }))}>Activate</button>}<button className="btn-danger" onClick={() => mutate("Agent deleted", () => api(`${base}/${row._id}`, { method: "DELETE" }))}>Delete</button></div>;
}

function UsageTable({ rows, mutate }) {
  return (
    <section className="card p-0">
      <div className="border-b border-hairline p-4"><h2 className="font-semibold text-ink">Usage & Credits</h2></div>
      <AdminTable columns={["User", "Plan", "Call Credits", "Email Credits", "Lead Credits", "Minutes", "Calls", "Emails", "Leads", "Actions"]} rows={rows.map(({ user, usage }) => [
        user.email,
        user.plan,
        user.credits?.callCredits || 0,
        user.credits?.emailCredits || 0,
        user.credits?.leadFinderCredits || 0,
        usage?.minutesUsed || 0,
        usage?.calls || 0,
        usage?.emailsSent || 0,
        usage?.leads || 0,
        <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => {
          const emailCredits = Number(prompt("Email credits", user.credits?.emailCredits || 0));
          if (!Number.isNaN(emailCredits)) mutate("Credits updated", () => api(`/admin/users/${user._id}/credits`, { method: "PATCH", body: { emailCredits } }));
        }}>Edit Credits</button><button className="btn-secondary" onClick={() => {
          const plan = prompt("Plan", user.plan);
          if (plan) mutate("Plan updated", () => api(`/admin/users/${user._id}/plan`, { method: "PATCH", body: { plan } }));
        }}>Change Plan</button></div>
      ])} />
    </section>
  );
}

function Integrations({ data }) {
  return <section className="card"><h2 className="font-semibold text-ink">Integration Settings</h2><p className="mt-1 text-sm text-neutral-500">Secrets are masked. Only super admins can access this section.</p><div className="mt-4 grid gap-3 md:grid-cols-2">{Object.entries(data || {}).map(([key, value]) => <div key={key} className="rounded-2xl bg-neutral-50 p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{key}</p><p className="break-anywhere text-sm font-semibold text-ink">{value || "Not configured"}</p></div>)}</div></section>;
}

function AuditTable({ rows }) {
  return <section className="card p-0"><div className="border-b border-hairline p-4"><h2 className="font-semibold text-ink">Audit Logs</h2></div><AdminTable columns={["Action", "Actor", "Target", "Resource", "Date", "Details"]} rows={rows.map((row) => [row.action, row.actorUserId?.email || "-", row.targetUserId?.email || "-", row.resourceType || "-", fmt(row.createdAt), row.description || JSON.stringify(row.metadata || {})])} /></section>;
}

function UserDetailModal({ detail, onClose, mutate }) {
  const { user, usage, dograhIntegration, tabs: userTabs } = detail;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="modal-panel rounded-2xl bg-white p-5 shadow-pop sm:max-w-5xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-semibold text-ink">{user.name}</h2><p className="text-sm text-neutral-500">{user.email}</p></div>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {["status", "role", "plan", "planStatus"].map((key) => <div key={key} className="rounded-2xl bg-neutral-50 p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{key}</p><p className="font-semibold text-ink">{user[key] || "-"}</p></div>)}
          <div className="rounded-2xl bg-neutral-50 p-3"><p className="text-xs font-semibold uppercase text-neutral-500">Dograh Integration</p><p className="font-semibold text-ink">{dograhIntegration?.status || "not_connected"}</p></div>
          <div className="rounded-2xl bg-neutral-50 p-3"><p className="text-xs font-semibold uppercase text-neutral-500">Dograh Last Error</p><p className="break-anywhere font-semibold text-ink">{dograhIntegration?.lastError || "-"}</p></div>
          {Object.entries(usage || {}).map(([key, value]) => <div key={key} className="rounded-2xl bg-neutral-50 p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{key}</p><p className="font-semibold text-ink">{value}</p></div>)}
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {Object.entries(userTabs || {}).filter(([key]) => key !== "usage").map(([key, rows]) => <MiniList key={key} title={key} rows={(rows || []).slice(0, 8).map((row) => `${nameOf(row)} - ${row.status || row.normalizedStatus || row.createdAt || ""}`)} />)}
        </div>
        <div className="mt-5 action-row">
          <button className="btn-secondary" onClick={() => {
            const plan = prompt("Plan", user.plan);
            if (plan) mutate("Plan updated", () => api(`/admin/users/${user._id}/plan`, { method: "PATCH", body: { plan } }));
          }}>Change Plan</button>
          <button className="btn-secondary" onClick={() => mutate("User suspended", () => api(`/admin/users/${user._id}/suspend`, { method: "POST" }))}>Suspend</button>
          <button className="btn-secondary" onClick={() => mutate("User activated", () => api(`/admin/users/${user._id}/activate`, { method: "POST" }))}>Activate</button>
        </div>
      </div>
    </div>
  );
}
