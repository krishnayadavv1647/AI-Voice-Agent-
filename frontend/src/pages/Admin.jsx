import {
  Activity,
  Bot,
  CalendarClock,
  CreditCard,
  Headphones,
  KeyRound,
  Mail,
  MoreVertical,
  Package,
  PhoneCall,
  RefreshCw,
  Search,
  Shield,
  UserCog,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api, setToken } from "../lib/api.js";
import { useAuth } from "../state/AuthContext.jsx";

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
  ["catalog", "Plan Catalog", Package],
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
  const { user: currentUser } = useAuth();
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

  async function addCredits(user) {
    const amount = Number(prompt(`Credits to add for ${user.email}`, "1000"));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const note = prompt("Note for audit log", "Manual Super Admin credit grant") || "";
    await mutate("Credits added", () => api(`/admin/users/${user._id}/wallet-credits`, { method: "POST", body: { amount, note } }));
    if (String(selectedUser?.user?._id || "") === String(user._id || "")) {
      const refreshed = await api(`/admin/users/${user._id}`);
      setSelectedUser((current) => current ? { ...current, ...refreshed } : current);
    }
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
                columns={["Name", "Email", "Role", "Status", "Plan", "Wallet Credits", "Agents", "Calls", "Leads", "Emails", "Created", "Last Login", "Actions"]}
                rows={filteredUsers.map((user) => [
                  user.name,
                  user.email,
                  <StatusBadge status={user.role} />,
                  <StatusBadge status={user.status} />,
                  user.plan,
                  (user.creditWallet?.balance || 0).toLocaleString(),
                  user.counts?.agents || 0,
                  user.counts?.calls || 0,
                  user.counts?.leads || 0,
                  user.counts?.emailsSent || 0,
                  fmt(user.createdAt),
                  fmt(user.lastLoginAt),
                  <ThreeDotMenu actions={[
                    { label: "View", onClick: () => viewUser(user) },
                    currentUser?.role === "super_admin" && { label: "Add Credits", onClick: () => addCredits(user) },
                    { label: "Login As", onClick: () => impersonate(user) },
                    { label: "Suspend", onClick: () => mutate("User suspended", () => api(`/admin/users/${user._id}/suspend`, { method: "POST" })) },
                    { label: "Activate", onClick: () => mutate("User activated", () => api(`/admin/users/${user._id}/activate`, { method: "POST" })) },
                    { label: "Reset Password", onClick: async () => { const result = await mutate("Temporary password generated", () => api(`/admin/users/${user._id}/reset-password`, { method: "POST" })); if (result?.temporaryPassword) alert(`Temporary password: ${result.temporaryPassword}`); } },
                    { label: "Delete", danger: true, onClick: () => confirm("Soft delete this user?") && mutate("User deleted", () => api(`/admin/users/${user._id}`, { method: "DELETE" })) }
                  ].filter(Boolean)} />
                ])}
              />
            </section>
          )}

          {["agents", "campaigns", "calls", "leads", "appointments", "followups", "email"].includes(active) && (
            <ResourceTable keyName={active} rows={resources[active] || []} mutate={mutate} />
          )}

          {active === "usage" && (
            <UsageTable rows={resources.usage || []} mutate={mutate} addCredits={addCredits} canAddCredits={currentUser?.role === "super_admin"} />
          )}

          {active === "plans" && <PlanConfigPanel />}

          {active === "catalog" && <PlanCatalogPanel users={users} />}

          {active === "integrations" && <Integrations data={resources.integrations} />}
          {active === "audit" && <AuditTable rows={resources.audit || []} />}
        </main>
      </div>

      {selectedUser && <UserDetailModal detail={selectedUser} onClose={() => setSelectedUser(null)} mutate={mutate} addCredits={addCredits} canAddCredits={currentUser?.role === "super_admin"} />}
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
    agents: ["Agent", ["Agent Name", "User", "Category", "Status", "Provider", "Calls", "Leads", "Created", "Actions"], (row) => [row.agentName, row.userId?.email, row.businessCategory, <StatusBadge status={row.status} />, row.provider || "vapi", row.totalCalls || 0, row.totalLeads || 0, fmt(row.createdAt), <RowActions row={row} base="/admin/agents" mutate={mutate} pause activate />]],
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

function UsageTable({ rows, mutate, addCredits, canAddCredits }) {
  return (
    <section className="card p-0">
      <div className="border-b border-hairline p-4"><h2 className="font-semibold text-ink">Usage & Credits</h2></div>
      <AdminTable columns={["User", "Plan", "Wallet Credits", "Call Credits", "Email Credits", "Lead Credits", "Minutes", "Calls", "Emails", "Leads", "Actions"]} rows={rows.map(({ user, usage }) => [
        user.email,
        user.plan,
        (user.creditWallet?.balance || 0).toLocaleString(),
        user.credits?.callCredits || 0,
        user.credits?.emailCredits || 0,
        user.credits?.leadFinderCredits || 0,
        usage?.minutesUsed || 0,
        usage?.calls || 0,
        usage?.emailsSent || 0,
        usage?.leads || 0,
        <ThreeDotMenu actions={[
          canAddCredits && { label: "Add Wallet Credits", onClick: () => addCredits(user) },
          { label: "Edit Credits", onClick: () => { const emailCredits = Number(prompt("Email credits", user.credits?.emailCredits || 0)); if (!Number.isNaN(emailCredits)) mutate("Credits updated", () => api(`/admin/users/${user._id}/credits`, { method: "PATCH", body: { emailCredits } })); } },
          { label: "Change Plan", onClick: () => { const plan = prompt("Plan", user.plan); if (plan) mutate("Plan updated", () => api(`/admin/users/${user._id}/plan`, { method: "PATCH", body: { plan } })); } }
        ].filter(Boolean)} />
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
const ACTION_KEYS = ["voice_call", "email_send", "lead_search", "appointment_book", "image_generate"];

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

function UserDetailModal({ detail, onClose, mutate, addCredits, canAddCredits }) {
  const { user, usage, tabs: userTabs } = detail;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="modal-panel rounded-2xl bg-white p-5 shadow-pop sm:max-w-5xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-semibold text-ink">{user.name}</h2><p className="text-sm text-neutral-500">{user.email}</p></div>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {["status", "role", "plan", "planStatus"].map((key) => <div key={key} className="rounded-2xl bg-neutral-50 p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{key}</p><p className="font-semibold text-ink">{user[key] || "-"}</p></div>)}
          <div className="rounded-2xl bg-neutral-50 p-3"><p className="text-xs font-semibold uppercase text-neutral-500">Wallet Credits</p><p className="font-semibold text-ink">{(user.creditWallet?.balance || 0).toLocaleString()}</p></div>
          {Object.entries(usage || {}).map(([key, value]) => <div key={key} className="rounded-2xl bg-neutral-50 p-3"><p className="text-xs font-semibold uppercase text-neutral-500">{key}</p><p className="font-semibold text-ink">{value}</p></div>)}
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {Object.entries(userTabs || {}).filter(([key]) => key !== "usage").map(([key, rows]) => <MiniList key={key} title={key} rows={(rows || []).slice(0, 8).map((row) => `${nameOf(row)} - ${row.status || row.normalizedStatus || row.createdAt || ""}`)} />)}
        </div>
        <div className="mt-5 action-row">
          {canAddCredits && <button className="btn-primary" onClick={() => addCredits(user)}>Add Credits</button>}
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

// ─── Plan Catalog Panel ───────────────────────────────────────────────────────

const TIERS = ["trial", "starter", "growth", "scale", "pro", "agency", "enterprise", "custom"];
const ALL_PLAN_FEATURES = ["voice_call", "email_send", "lead_search", "appointment_book", "image_generate"];
const PLAN_FEATURE_LABELS = {
  voice_call: "Voice calls", email_send: "Email campaigns", lead_search: "Lead Finder",
  appointment_book: "Appointments", image_generate: "Agent images"
};
const LIMIT_FIELDS = [
  ["maxAgents", "Max Agents"], ["maxContacts", "Max Contacts"], ["maxCampaigns", "Max Campaigns"],
  ["callsPerDay", "Calls/day"], ["emailsPerDay", "Emails/day"], ["teamMembers", "Team Members"]
];

const BLANK_FORM = {
  name: "", description: "", badge: "", tier: "custom",
  visibility: "public", assignedUserIds: [],
  pricing: { monthlyPrice: 0, yearlyPrice: "", currency: "USD", isContactSales: false },
  monthlyCredits: 0, rollover: false,
  limits: { maxAgents: "", maxContacts: "", maxCampaigns: "", callsPerDay: "", emailsPerDay: "", teamMembers: "", actionsPerMin: 60 },
  unlimitedFlags: { maxAgents: true, maxContacts: true, maxCampaigns: true, callsPerDay: true, emailsPerDay: true, teamMembers: true },
  byokAllowed: true, features: [],
  applyImmediately: false,
};

function PlanCatalogPanel({ users }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [archiveInput, setArchiveInput] = useState("");
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => { loadPlans(); }, []);

  async function loadPlans() {
    setLoading(true);
    try {
      const data = await api("/admin/catalog-plans");
      setPlans(data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingPlan(null);
    setForm(BLANK_FORM);
    setModalError("");
    setModalOpen(true);
  }

  function openEdit(plan) {
    const unlimitedFlags = {};
    for (const [field] of LIMIT_FIELDS) {
      unlimitedFlags[field] = plan.limits?.[field] == null;
    }
    setEditingPlan(plan);
    setForm({
      name: plan.name || "",
      description: plan.description || "",
      badge: plan.badge || "",
      tier: plan.tier || "custom",
      visibility: plan.visibility || "public",
      assignedUserIds: (plan.assignedUserIds || []).map((u) => u._id || u),
      pricing: {
        monthlyPrice: plan.pricing?.monthlyPrice ?? "",
        yearlyPrice: plan.pricing?.yearlyPrice ?? "",
        currency: plan.pricing?.currency || "USD",
        isContactSales: plan.pricing?.isContactSales || false,
      },
      monthlyCredits: plan.monthlyCredits ?? 0,
      rollover: plan.rollover || false,
      limits: {
        maxAgents: plan.limits?.maxAgents ?? "",
        maxContacts: plan.limits?.maxContacts ?? "",
        maxCampaigns: plan.limits?.maxCampaigns ?? "",
        callsPerDay: plan.limits?.callsPerDay ?? "",
        emailsPerDay: plan.limits?.emailsPerDay ?? "",
        teamMembers: plan.limits?.teamMembers ?? "",
        actionsPerMin: plan.limits?.actionsPerMin ?? "",
      },
      unlimitedFlags,
      byokAllowed: plan.byokAllowed !== false,
      features: plan.features || [],
      applyImmediately: false,
    });
    setModalError("");
    setModalOpen(true);
  }

  function setField(path, value) {
    setForm((prev) => {
      const next = { ...prev };
      const parts = path.split(".");
      if (parts.length === 1) {
        next[parts[0]] = value;
      } else if (parts.length === 2) {
        next[parts[0]] = { ...next[parts[0]], [parts[1]]: value };
      }
      return next;
    });
  }

  function toggleFeature(feat) {
    setForm((prev) => {
      const has = prev.features.includes(feat);
      return { ...prev, features: has ? prev.features.filter((f) => f !== feat) : [...prev.features, feat] };
    });
  }

  function toggleAssignedUser(userId) {
    setForm((prev) => {
      const str = String(userId);
      const has = prev.assignedUserIds.some((id) => String(id) === str);
      return { ...prev, assignedUserIds: has ? prev.assignedUserIds.filter((id) => String(id) !== str) : [...prev.assignedUserIds, str] };
    });
  }

  function buildBody() {
    const limits = {};
    for (const [field] of LIMIT_FIELDS) {
      limits[field] = form.unlimitedFlags[field] ? null : (form.limits[field] === "" ? null : Number(form.limits[field]));
    }
    limits.actionsPerMin = Number(form.limits.actionsPerMin) || 0;

    return {
      name: form.name,
      description: form.description || undefined,
      badge: form.badge || undefined,
      tier: form.tier,
      visibility: form.visibility,
      assignedUserIds: form.visibility === "private" ? form.assignedUserIds : [],
      pricing: {
        monthlyPrice: form.pricing.isContactSales ? null : (form.pricing.monthlyPrice === "" ? null : Number(form.pricing.monthlyPrice)),
        yearlyPrice: form.pricing.yearlyPrice === "" ? null : Number(form.pricing.yearlyPrice),
        currency: form.pricing.currency,
        isContactSales: form.pricing.isContactSales,
      },
      monthlyCredits: Number(form.monthlyCredits) || 0,
      rollover: form.rollover,
      limits,
      byokAllowed: form.byokAllowed,
      features: form.features,
      ...(editingPlan ? { applyImmediately: form.applyImmediately, __v: editingPlan.__v } : {}),
    };
  }

  async function handleSave() {
    setSaving(true);
    setModalError("");
    try {
      const body = buildBody();
      if (editingPlan) {
        await api(`/admin/catalog-plans/${editingPlan._id}`, { method: "PUT", body });
        setNotice("Plan updated.");
      } else {
        await api("/admin/catalog-plans", { method: "POST", body });
        setNotice("Plan created.");
      }
      setModalOpen(false);
      await loadPlans();
    } catch (err) {
      setModalError(err.response?.message || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate(plan) {
    try {
      await api(`/admin/catalog-plans/${plan._id}/duplicate`, { method: "POST" });
      setNotice("Plan duplicated.");
      await loadPlans();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function handleArchive(plan) {
    if (archiveInput !== "ARCHIVE") {
      setError("Type ARCHIVE to confirm");
      return;
    }
    try {
      const result = await api(`/admin/catalog-plans/${plan._id}/archive`, { method: "PATCH" });
      setNotice(result.message || "Plan archived.");
      setArchiveConfirm(null);
      setArchiveInput("");
      await loadPlans();
    } catch (err) {
      setError(errorText(err));
      setArchiveConfirm(null);
    }
  }

  async function handleRestore(plan) {
    try {
      await api(`/admin/catalog-plans/${plan._id}/restore`, { method: "PATCH" });
      setNotice("Plan restored.");
      await loadPlans();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function handleDelete(plan) {
    if (!confirm(`Permanently delete "${plan.name}"? This cannot be undone.`)) return;
    try {
      await api(`/admin/catalog-plans/${plan._id}`, { method: "DELETE" });
      setNotice("Plan deleted.");
      await loadPlans();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  if (loading) return <div className="card text-sm text-neutral-500">Loading plan catalog...</div>;

  return (
    <div className="space-y-4">
      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <section className="card p-0">
        <div className="flex items-center justify-between border-b border-hairline p-4">
          <h2 className="font-semibold text-ink">Plan Catalog</h2>
          <button className="btn-primary" onClick={openCreate}>+ New Plan</button>
        </div>

        <div className="table-wrap">
          <table className="table w-full min-w-[900px]">
            <thead>
              <tr>
                {["Name", "Tier", "Visibility", "Status", "Subscribers", "Credits/mo", "Updated", "Actions"].map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan._id}>
                  <td className="align-middle">
                    <div className="font-medium text-ink">{plan.name}</div>
                    {plan.badge && <div className="text-xs text-neutral-400">{plan.badge}</div>}
                  </td>
                  <td className="align-middle">
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold capitalize text-neutral-700">{plan.tier}</span>
                  </td>
                  <td className="align-middle">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${plan.visibility === "public" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {plan.visibility}
                    </span>
                  </td>
                  <td className="align-middle">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${plan.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>
                      {plan.status}
                    </span>
                  </td>
                  <td className="align-middle text-sm">{plan.subscriberCount ?? 0}</td>
                  <td className="align-middle text-sm">{(plan.monthlyCredits || 0).toLocaleString()}</td>
                  <td className="align-middle text-xs text-neutral-500">{plan.updatedAt ? new Date(plan.updatedAt).toLocaleDateString() : "-"}</td>
                  <td className="whitespace-nowrap align-middle">
                    <ThreeDotMenu actions={[
                      { label: "Edit", onClick: () => openEdit(plan) },
                      { label: "Duplicate", onClick: () => handleDuplicate(plan) },
                      plan.status === "active"
                        ? { label: "Archive", onClick: () => { setArchiveConfirm(plan); setArchiveInput(""); } }
                        : { label: "Restore", onClick: () => handleRestore(plan) },
                      {
                        label: "Delete",
                        danger: true,
                        disabled: (plan.subscriberCount ?? 0) > 0,
                        onClick: () => handleDelete(plan),
                      },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!plans.length && <div className="p-6 text-sm text-neutral-500">No plans yet. Create one above.</div>}
        </div>
      </section>

      {/* Archive confirmation dialog */}
      {archiveConfirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4 backdrop-blur-sm" onClick={() => setArchiveConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-ink">Archive "{archiveConfirm.name}"?</h3>
            <p className="mt-2 text-sm text-neutral-600">
              {archiveConfirm.subscriberCount > 0
                ? `${archiveConfirm.subscriberCount} active subscriber(s) will keep their limits until their next cycle. They won't be able to re-select this plan.`
                : "No active subscribers. Safe to archive."}
            </p>
            <p className="mt-3 text-sm text-neutral-600">Type <strong>ARCHIVE</strong> to confirm:</p>
            <input
              className="input mt-2 w-full"
              value={archiveInput}
              onChange={(e) => setArchiveInput(e.target.value)}
              placeholder="ARCHIVE"
            />
            <div className="mt-4 flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setArchiveConfirm(null)}>Cancel</button>
              <button className="btn-primary flex-1 !bg-rose-600 hover:!bg-rose-700" onClick={() => handleArchive(archiveConfirm)}>Archive</button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4 backdrop-blur-sm">
          <div className="mx-auto my-8 w-full max-w-2xl rounded-2xl bg-white shadow-pop">
            <div className="flex items-center justify-between border-b border-hairline p-5">
              <h2 className="text-lg font-semibold text-ink">{editingPlan ? "Edit Plan" : "Create Plan"}</h2>
              <button className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6 p-5">
              {modalError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{modalError}</div>}

              {/* Basics */}
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Basics</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="col-span-2 space-y-1 text-xs font-medium text-neutral-600">
                    Name <span className="text-rose-500">*</span>
                    <input className="input mt-1 w-full" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Agency Plus" />
                  </label>
                  <label className="col-span-2 space-y-1 text-xs font-medium text-neutral-600">
                    Description
                    <input className="input mt-1 w-full" value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="Optional short description" />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-neutral-600">
                    Badge (optional UI tag)
                    <input className="input mt-1 w-full" value={form.badge} onChange={(e) => setField("badge", e.target.value)} placeholder="e.g. Most Popular" />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-neutral-600">
                    Tier (cosmetic)
                    <select className="input mt-1 w-full" value={form.tier} onChange={(e) => setField("tier", e.target.value)}>
                      {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                </div>
              </section>

              {/* Visibility */}
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Visibility</p>
                <div className="flex gap-4">
                  {["public", "private"].map((v) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                      <input type="radio" name="visibility" value={v} checked={form.visibility === v} onChange={() => setField("visibility", v)} />
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  Public plans appear to every user on Plans &amp; Billing. Private plans appear only to the people you assign below.
                </p>
                {form.visibility === "private" && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-medium text-neutral-600">Assign users</p>
                    <input
                      className="input mb-2 w-full"
                      placeholder="Search by name or email…"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-hairline">
                      {filteredUsers.slice(0, 50).map((u) => {
                        const checked = form.assignedUserIds.some((id) => String(id) === String(u._id));
                        return (
                          <label key={u._id} className="flex cursor-pointer items-center gap-2 border-b border-hairline/60 px-3 py-2 text-sm hover:bg-neutral-50">
                            <input type="checkbox" checked={checked} onChange={() => toggleAssignedUser(u._id)} />
                            <span className="flex-1 truncate">{u.name}</span>
                            <span className="text-xs text-neutral-400">{u.email}</span>
                          </label>
                        );
                      })}
                      {filteredUsers.length === 0 && <p className="p-3 text-xs text-neutral-400">No users match</p>}
                    </div>
                    {form.assignedUserIds.length > 0 && (
                      <p className="mt-1 text-xs text-neutral-500">{form.assignedUserIds.length} user(s) selected</p>
                    )}
                  </div>
                )}
              </section>

              {/* Pricing */}
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Pricing</p>
                <label className="mb-3 flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" checked={form.pricing.isContactSales} onChange={(e) => setField("pricing.isContactSales", e.target.checked)} />
                  Show "Contact Sales" instead of a price
                </label>
                {!form.pricing.isContactSales && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="space-y-1 text-xs font-medium text-neutral-600">
                      Monthly price <span className="text-rose-500">*</span>
                      <input type="number" min="0" className="input mt-1 w-full" value={form.pricing.monthlyPrice} onChange={(e) => setField("pricing.monthlyPrice", e.target.value)} />
                    </label>
                    <label className="space-y-1 text-xs font-medium text-neutral-600">
                      Yearly price
                      <input type="number" min="0" className="input mt-1 w-full" value={form.pricing.yearlyPrice} onChange={(e) => setField("pricing.yearlyPrice", e.target.value)} />
                    </label>
                    <label className="space-y-1 text-xs font-medium text-neutral-600">
                      Currency
                      <select className="input mt-1 w-full" value={form.pricing.currency} onChange={(e) => setField("pricing.currency", e.target.value)}>
                        {["USD", "INR", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </label>
                  </div>
                )}
              </section>

              {/* Credits & Rollover */}
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Credits &amp; Rollover</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium text-neutral-600">
                    Monthly Credits
                    <input type="number" min="0" className="input mt-1 w-full" value={form.monthlyCredits} onChange={(e) => setField("monthlyCredits", e.target.value)} />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700 pt-5">
                    <input type="checkbox" checked={form.rollover} onChange={(e) => setField("rollover", e.target.checked)} />
                    Unused credits roll over to next cycle
                  </label>
                </div>
              </section>

              {/* Limits */}
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Limits</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {LIMIT_FIELDS.map(([field, label]) => (
                    <div key={field} className="space-y-1">
                      <p className="text-xs font-medium text-neutral-600">{label}</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          className="input flex-1"
                          value={form.unlimitedFlags[field] ? "" : form.limits[field]}
                          disabled={form.unlimitedFlags[field]}
                          onChange={(e) => setField(`limits.${field}`, e.target.value)}
                          placeholder={form.unlimitedFlags[field] ? "Unlimited" : "0"}
                        />
                        <label className="flex items-center gap-1 text-xs text-neutral-500 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.unlimitedFlags[field] || false}
                            onChange={(e) => setForm((prev) => ({
                              ...prev,
                              unlimitedFlags: { ...prev.unlimitedFlags, [field]: e.target.checked },
                              limits: { ...prev.limits, [field]: e.target.checked ? "" : prev.limits[field] }
                            }))}
                          />
                          ∞
                        </label>
                      </div>
                    </div>
                  ))}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-neutral-600">
                      Actions/min <span className="text-rose-500">*</span>
                      <span className="ml-1 text-neutral-400" title="Fair-usage ceiling — always enforced, cannot be unlimited">⚠ required</span>
                    </p>
                    <input
                      type="number"
                      min="1"
                      className="input w-full"
                      value={form.limits.actionsPerMin}
                      onChange={(e) => setField("limits.actionsPerMin", e.target.value)}
                    />
                  </div>
                </div>
              </section>

              {/* Features */}
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Features included</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ALL_PLAN_FEATURES.map((f) => (
                    <label key={f} className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                      <input type="checkbox" checked={form.features.includes(f)} onChange={() => toggleFeature(f)} />
                      {PLAN_FEATURE_LABELS[f] || f}
                    </label>
                  ))}
                </div>
              </section>

              {/* BYOK */}
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">BYOK</p>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" checked={form.byokAllowed} onChange={(e) => setField("byokAllowed", e.target.checked)} />
                  Allow Bring Your Own Key on this plan
                </label>
              </section>

              {/* Apply immediately — edit only */}
              {editingPlan && (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-amber-800">
                    <input type="checkbox" checked={form.applyImmediately} onChange={(e) => setField("applyImmediately", e.target.checked)} />
                    Apply changes immediately to all current subscribers
                  </label>
                  <p className="mt-1 text-xs text-amber-700">
                    By default, limit/credit changes take effect at the subscriber's next billing cycle. Check this to re-snapshot all active subscribers right now. One log entry will be written per affected user.
                  </p>
                  {editingPlan.subscriberCount > 0 && (
                    <p className="mt-1 text-xs font-semibold text-amber-800">{editingPlan.subscriberCount} active subscriber(s) currently on this plan.</p>
                  )}
                </section>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-hairline p-5">
              <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? "Saving…" : editingPlan ? "Save Changes" : "Create Plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
