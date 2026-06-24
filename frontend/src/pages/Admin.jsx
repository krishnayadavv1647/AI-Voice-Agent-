import {
  Activity,
  Bot,
  CalendarClock,
  CreditCard,
  Headphones,
  KeyRound,
  Mail,
  MoreVertical,
  PhoneCall,
  RefreshCw,
  Search,
  Shield,
  UserCog,
  Users
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
                <div className="flex min-w-[16rem] flex-1 items-center gap-2 rounded-xl border border-[var(--border-dark)] px-3">
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
                  <ThreeDotMenu actions={[
                    { label: "View", onClick: () => viewUser(user) },
                    { label: "Login As", onClick: () => impersonate(user) },
                    { label: "Suspend", onClick: () => mutate("User suspended", () => api(`/admin/users/${user._id}/suspend`, { method: "POST" })) },
                    { label: "Activate", onClick: () => mutate("User activated", () => api(`/admin/users/${user._id}/activate`, { method: "POST" })) },
                    { label: "Reset Password", onClick: async () => { const result = await mutate("Temporary password generated", () => api(`/admin/users/${user._id}/reset-password`, { method: "POST" })); if (result?.temporaryPassword) alert(`Temporary password: ${result.temporaryPassword}`); } },
                    { label: "Delete", danger: true, onClick: () => confirm("Soft delete this user?") && mutate("User deleted", () => api(`/admin/users/${user._id}`, { method: "DELETE" })) }
                  ]} />
                ])}
              />
            </section>
          )}

          {["agents", "campaigns", "calls", "leads", "appointments", "followups", "email"].includes(active) && (
            <ResourceTable keyName={active} rows={resources[active] || []} mutate={mutate} />
          )}

          {active === "usage" && (
            <UsageTable rows={resources.usage || []} mutate={mutate} />
          )}

          {active === "plans" && <PlanConfigPanel />}

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
        ? "whitespace-nowrap align-middle"
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
    campaigns: ["Campaigns", ["Campaign", "User", "Agent", "Status", "Recipients", "Answered", "Failed", "Start", "Actions"], (row) => [row.name, row.userId?.email, row.agentId?.agentName, <StatusBadge status={row.status} />, row.stats?.totalRecipients || 0, row.stats?.answered || 0, row.stats?.failed || 0, fmt(row.startAt), <ThreeDotMenu actions={[{ label: "Pause", onClick: () => mutate("Campaign paused", () => api(`/admin/campaigns/${row._id}/pause`, { method: "POST" })) }, { label: "Cancel", danger: true, onClick: () => mutate("Campaign cancelled", () => api(`/admin/campaigns/${row._id}/cancel`, { method: "POST" })) }]} />]],
    calls: ["Calls", ["Date", "User", "Agent", "Caller", "Calling", "Status", "Outcome", "Duration", "Lead", "Actions"], (row) => [fmt(row.createdAt), row.userId?.email, row.agentId?.agentName, row.callerNumber, row.callingNumber, <StatusBadge status={row.normalizedStatus || row.status} />, row.outcome || "-", row.duration || row.durationSeconds || "-", row.leadId ? "Yes" : "No", <ThreeDotMenu actions={[{ label: "Delete", danger: true, onClick: () => mutate("Call deleted", () => api(`/admin/calls/${row._id}`, { method: "DELETE" })) }]} />]],
    leads: ["Leads", ["Lead", "User", "Agent", "Phone", "Email", "City", "Source", "Status", "Created", "Actions"], (row) => [nameOf(row), row.userId?.email, row.agentId?.agentName, row.phone, row.email, row.city, row.source, <StatusBadge status={row.status} />, fmt(row.createdAt), <ThreeDotMenu actions={[{ label: "Delete", danger: true, onClick: () => mutate("Lead deleted", () => api(`/admin/leads/${row._id}`, { method: "DELETE" })) }]} />]],
    appointments: ["Appointments", ["Lead", "User", "Agent", "Date & Time", "Phone", "Type", "Status", "Reminder", "Call Status", "Actions"], (row) => [nameOf(row.leadId), row.userId?.email, row.agentId?.agentName, fmt(row.startAt), row.customerPhone, row.appointmentType, <StatusBadge status={row.status} />, row.reminderStatus, row.appointmentCallStatus, <ThreeDotMenu actions={[{ label: "Complete", onClick: () => mutate("Appointment completed", () => api(`/admin/appointments/${row._id}/complete`, { method: "POST" })) }, { label: "Cancel", danger: true, onClick: () => mutate("Appointment cancelled", () => api(`/admin/appointments/${row._id}/cancel`, { method: "POST" })) }]} />]],
    followups: ["Follow-ups", ["Lead", "User", "Agent", "Type", "Trigger", "Scheduled", "Status", "Attempts", "Error", "Actions"], (row) => [nameOf(row.leadId), row.userId?.email, row.agentId?.agentName, row.type, row.trigger, fmt(row.scheduledAt), <StatusBadge status={row.status} />, `${row.attemptCount || 0}/${row.maxAttempts || 0}`, row.lastError || "-", <ThreeDotMenu actions={[{ label: "Run", onClick: () => mutate("Follow-up queued", () => api(`/admin/followups/${row._id}/run`, { method: "POST" })) }, { label: "Cancel", danger: true, onClick: () => mutate("Follow-up cancelled", () => api(`/admin/followups/${row._id}/cancel`, { method: "POST" })) }]} />]],
    email: ["Email Campaigns", ["Campaign", "User", "Agent", "Status", "Recipients", "Sent", "Failed", "Created", "Actions"], (row) => [row.name, row.userId?.email, row.agentId?.agentName, <StatusBadge status={row.status} />, row.totalRecipients || 0, row.sentCount || 0, row.failedCount || 0, fmt(row.createdAt), "-"]]
  };
  const [title, columns, mapper] = configs[keyName];
  return <section className="card p-0"><div className="border-b border-hairline p-4"><h2 className="font-semibold text-ink">{title}</h2></div><AdminTable columns={columns} rows={rows.map(mapper)} /></section>;
}

function RowActions({ row, base, mutate, pause, activate }) {
  const actions = [
    pause && { label: "Pause", onClick: () => mutate("Agent paused", () => api(`${base}/${row._id}/pause`, { method: "POST" })) },
    activate && { label: "Activate", onClick: () => mutate("Agent activated", () => api(`${base}/${row._id}/activate`, { method: "POST" })) },
    { label: "Delete", danger: true, onClick: () => mutate("Agent deleted", () => api(`${base}/${row._id}`, { method: "DELETE" })) }
  ].filter(Boolean);
  return <ThreeDotMenu actions={actions} />;
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
        <ThreeDotMenu actions={[
          { label: "Edit Credits", onClick: () => { const emailCredits = Number(prompt("Email credits", user.credits?.emailCredits || 0)); if (!Number.isNaN(emailCredits)) mutate("Credits updated", () => api(`/admin/users/${user._id}/credits`, { method: "PATCH", body: { emailCredits } })); } },
          { label: "Change Plan", onClick: () => { const plan = prompt("Plan", user.plan); if (plan) mutate("Plan updated", () => api(`/admin/users/${user._id}/plan`, { method: "PATCH", body: { plan } })); } }
        ]} />
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

function ThreeDotMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.right - 160 });
    }
    setOpen((prev) => !prev);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="rounded-lg border border-hairline p-1.5 text-neutral-500 hover:bg-neutral-50"
        onClick={handleToggle}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
          className="w-40 rounded-xl border border-hairline bg-white py-1 shadow-lg"
        >
          {actions.map((act, i) => (
            <button
              key={i}
              type="button"
              disabled={act.disabled}
              className={`flex w-full items-center px-3 py-2 text-left text-sm disabled:opacity-40 ${act.danger ? "text-rose-600 hover:bg-rose-50" : "text-neutral-700 hover:bg-neutral-50"}`}
              onClick={() => {
                act.onClick();
                setOpen(false);
              }}
            >
              {act.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const ALL_FEATURES = ["voice_call", "email_send", "lead_search", "appointment_book", "image_generate"];
const FEATURE_LABELS = { voice_call: "Voice calls", email_send: "Email send", lead_search: "Lead Finder", appointment_book: "Appointments", image_generate: "Agent images" };
const PLAN_KEYS = ["starter", "growth", "scale"];
const PACK_KEYS = ["tp_500", "tp_2000", "tp_5000"];
const ACTION_KEYS = ["voice_call", "dograh_call", "email_send", "lead_search", "appointment_book", "image_generate"];

function numVal(obj, key) { return Number(obj?.[key]) || 0; }

function PlanConfigPanel() {
  const [config, setConfig] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    try {
      const data = await api("/admin/plan-config");
      setConfig(data);
      // Initialise editable drafts from live values
      const planDrafts = {};
      for (const plan of data.plans || []) {
        planDrafts[plan.key] = {
          credits: plan.credits,
          priceInr: plan.priceInr,
          priceUsd: plan.priceUsd,
          features: [...(plan.features || [])],
          maxAgents: plan.limits?.maxAgents,
          maxCallsPerMonth: plan.limits?.maxCallsPerMonth,
          maxEmailsPerMonth: plan.limits?.maxEmailsPerMonth,
          maxLeadSearchesPerMonth: plan.limits?.maxLeadSearchesPerMonth
        };
      }
      const packDrafts = {};
      for (const pack of data.topupPacks || []) {
        packDrafts[pack.key] = { credits: pack.credits, priceInr: pack.priceInr, priceUsd: pack.priceUsd };
      }
      const pricingDrafts = {};
      for (const [action, rates] of Object.entries(data.creditPricing || {})) {
        pricingDrafts[action] = { platform: rates.cost, byok: rates.platformFee };
      }
      setDrafts({ plans: planDrafts, packs: packDrafts, pricing: pricingDrafts });
    } catch (err) {
      setError(err.response?.message || err.message);
    }
  }

  function setPlanField(planKey, field, value) {
    setDrafts((prev) => ({ ...prev, plans: { ...prev.plans, [planKey]: { ...prev.plans?.[planKey], [field]: value } } }));
  }

  function toggleFeature(planKey, feature) {
    const current = drafts.plans?.[planKey]?.features || [];
    const next = current.includes(feature) ? current.filter((f) => f !== feature) : [...current, feature];
    setPlanField(planKey, "features", next);
  }

  function setPackField(packKey, field, value) {
    setDrafts((prev) => ({ ...prev, packs: { ...prev.packs, [packKey]: { ...prev.packs?.[packKey], [field]: value } } }));
  }

  function setPricingField(action, field, value) {
    setDrafts((prev) => ({ ...prev, pricing: { ...prev.pricing, [action]: { ...prev.pricing?.[action], [field]: value } } }));
  }

  async function savePlans(planKey) {
    setSaving(`plan_${planKey}`);
    setNotice(""); setError("");
    try {
      const d = drafts.plans?.[planKey] || {};
      await api("/admin/plan-config", {
        method: "PATCH",
        body: {
          plans: {
            [planKey]: {
              credits: Number(d.credits) || 0,
              priceInr: Number(d.priceInr) || 0,
              priceUsd: Number(d.priceUsd) || 0,
              features: d.features || [],
              limits: {
                maxAgents: Number(d.maxAgents) || 0,
                maxCallsPerMonth: Number(d.maxCallsPerMonth) || 0,
                maxEmailsPerMonth: Number(d.maxEmailsPerMonth) || 0,
                maxLeadSearchesPerMonth: Number(d.maxLeadSearchesPerMonth) || 0
              }
            }
          }
        }
      });
      setNotice("Plan saved.");
      await loadConfig();
    } catch (err) {
      setError(err.response?.message || err.message);
    } finally {
      setSaving("");
    }
  }

  async function savePacks() {
    setSaving("packs");
    setNotice(""); setError("");
    try {
      const topupPacks = {};
      for (const packKey of PACK_KEYS) {
        const d = drafts.packs?.[packKey] || {};
        topupPacks[packKey] = { credits: Number(d.credits) || 0, priceInr: Number(d.priceInr) || 0, priceUsd: Number(d.priceUsd) || 0 };
      }
      await api("/admin/plan-config", { method: "PATCH", body: { topupPacks } });
      setNotice("Top-up packs saved.");
      await loadConfig();
    } catch (err) {
      setError(err.response?.message || err.message);
    } finally {
      setSaving("");
    }
  }

  async function savePricing() {
    setSaving("pricing");
    setNotice(""); setError("");
    try {
      const creditPricing = {};
      for (const action of ACTION_KEYS) {
        const d = drafts.pricing?.[action] || {};
        creditPricing[action] = { platform: Number(d.platform) || 0, byok: Number(d.byok) || 0 };
      }
      await api("/admin/plan-config", { method: "PATCH", body: { creditPricing } });
      setNotice("Credit pricing saved.");
      await loadConfig();
    } catch (err) {
      setError(err.response?.message || err.message);
    } finally {
      setSaving("");
    }
  }

  if (!config) return <div className="card text-sm text-neutral-500">Loading plan configuration...</div>;

  return (
    <div className="space-y-6">
      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {/* Plan Cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_KEYS.map((planKey) => {
          const d = drafts.plans?.[planKey] || {};
          const busy = saving === `plan_${planKey}`;
          const label = planKey.charAt(0).toUpperCase() + planKey.slice(1);
          return (
            <section key={planKey} className="card space-y-4">
              <h2 className="font-semibold text-ink">{label} Plan</h2>

              <div className="grid grid-cols-3 gap-3">
                <label className="col-span-3 space-y-1 text-xs font-semibold uppercase text-neutral-500">
                  Credits granted on purchase
                  <input type="number" className="mt-1 input w-full" value={d.credits ?? ""} onChange={(e) => setPlanField(planKey, "credits", e.target.value)} />
                </label>
                <label className="space-y-1 text-xs font-semibold uppercase text-neutral-500">
                  Price ₹
                  <input type="number" className="mt-1 input w-full" value={d.priceInr ?? ""} onChange={(e) => setPlanField(planKey, "priceInr", e.target.value)} />
                </label>
                <label className="space-y-1 text-xs font-semibold uppercase text-neutral-500">
                  Price $
                  <input type="number" className="mt-1 input w-full" value={d.priceUsd ?? ""} onChange={(e) => setPlanField(planKey, "priceUsd", e.target.value)} />
                </label>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Features included</p>
                <div className="space-y-1">
                  {ALL_FEATURES.map((f) => (
                    <label key={f} className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                      <input type="checkbox" checked={(d.features || []).includes(f)} onChange={() => toggleFeature(planKey, f)} />
                      {FEATURE_LABELS[f] || f}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Monthly limits</p>
                <div className="grid grid-cols-2 gap-2">
                  {[["maxAgents", "Max agents"], ["maxCallsPerMonth", "Calls/mo"], ["maxEmailsPerMonth", "Emails/mo"], ["maxLeadSearchesPerMonth", "Lead searches/mo"]].map(([field, lbl]) => (
                    <label key={field} className="space-y-1 text-xs text-neutral-500">
                      {lbl}
                      <input type="number" className="mt-0.5 input w-full" value={d[field] ?? ""} onChange={(e) => setPlanField(planKey, field, e.target.value)} />
                    </label>
                  ))}
                </div>
              </div>

              <button className="btn-primary w-full" disabled={busy} onClick={() => savePlans(planKey)}>
                {busy ? "Saving…" : `Save ${label}`}
              </button>
            </section>
          );
        })}
      </div>

      {/* Top-up Packs */}
      <section className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-ink">Top-up Packs</h2>
          <button className="btn-primary" disabled={saving === "packs"} onClick={savePacks}>{saving === "packs" ? "Saving…" : "Save Packs"}</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {PACK_KEYS.map((packKey) => {
            const d = drafts.packs?.[packKey] || {};
            return (
              <div key={packKey} className="rounded-xl border border-hairline p-4 space-y-2">
                <p className="text-xs font-semibold uppercase text-neutral-500">{packKey.replace("tp_", "")}-credit pack</p>
                <label className="block text-xs text-neutral-500">Credits<input type="number" className="mt-1 input w-full" value={d.credits ?? ""} onChange={(e) => setPackField(packKey, "credits", e.target.value)} /></label>
                <label className="block text-xs text-neutral-500">Price ₹<input type="number" className="mt-1 input w-full" value={d.priceInr ?? ""} onChange={(e) => setPackField(packKey, "priceInr", e.target.value)} /></label>
                <label className="block text-xs text-neutral-500">Price $<input type="number" className="mt-1 input w-full" value={d.priceUsd ?? ""} onChange={(e) => setPackField(packKey, "priceUsd", e.target.value)} /></label>
              </div>
            );
          })}
        </div>
      </section>

      {/* Credit Pricing */}
      <section className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-ink">Credit Costs per Action</h2>
          <button className="btn-primary" disabled={saving === "pricing"} onClick={savePricing}>{saving === "pricing" ? "Saving…" : "Save Pricing"}</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase text-neutral-500">
                <th className="py-2 pr-4 font-semibold">Action</th>
                <th className="py-2 pr-4 font-semibold">Platform credits</th>
                <th className="py-2 pr-4 font-semibold">BYOK fee</th>
              </tr>
            </thead>
            <tbody>
              {ACTION_KEYS.map((action) => {
                const d = drafts.pricing?.[action] || {};
                return (
                  <tr key={action} className="border-b border-hairline/60">
                    <td className="py-2 pr-4 font-medium text-neutral-700">{action.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-4">
                      <input type="number" className="input w-24" value={d.platform ?? ""} onChange={(e) => setPricingField(action, "platform", e.target.value)} />
                    </td>
                    <td className="py-2 pr-4">
                      <input type="number" className="input w-24" value={d.byok ?? ""} onChange={(e) => setPricingField(action, "byok", e.target.value)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
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
