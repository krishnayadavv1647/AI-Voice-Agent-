import {
  Bell,
  Bot,
  CalendarClock,
  Coins,
  CreditCard,
  Gauge,
  Headphones,
  Mail,
  MailOpen,
  PhoneOutgoing,
  Languages,
  LayoutTemplate,
  LogOut,
  Menu,
  PanelLeft,
  PhoneCall,
  Plug,
  Search,
  Settings,
  Shield,
  Upload,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../state/AuthContext.jsx";
import { useCredits } from "../state/CreditsContext.jsx";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: Gauge },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/calls", label: "Call Logs", icon: PhoneCall },
  { to: "/outbound", label: "Outbound", icon: PhoneOutgoing },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/lead-finder", label: "Lead Finder", icon: Search },
  { to: "/email-outreach", label: "Email Campaign", icon: Mail },
  { to: "/email-inbox", label: "Email Inbox", icon: MailOpen },
  { to: "/followups", label: "Follow-ups", icon: CalendarClock },
  { to: "/appointments", label: "Appointments", icon: CalendarClock },
  { to: "/import-calls", label: "Import Calls", icon: Upload },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/voice-language", label: "Voice & Language", icon: Languages },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/telephony-configuration", label: "Telephony Configuration", icon: PhoneCall },
  { to: "/credits", label: "Credits & Usage", icon: Coins },
  { to: "/billing", label: "Plans & Billing", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings }
];

const navSections = [
  {
    label: "WORKSPACE",
    items: ["/dashboard"]
  },
  {
    label: "BUILD",
    items: ["/agents", "/outbound", "/leads", "/lead-finder", "/templates", "/voice-language"]
  },
  {
    label: "TEST",
    items: ["/calls"]
  },
  {
    label: "OBSERVE",
    items: ["/messages", "/email-inbox", "/followups", "/appointments", "/import-calls"]
  },
  {
    label: "MANAGE",
    items: ["/email-outreach", "/integrations", "/telephony-configuration", "/credits", "/billing", "/settings"]
  }
];

function NavItem({ item, onClick, unreadEmailCount = 0, collapsed = false }) {
  const { to, label, icon: Icon } = item;

  return (
    <NavLink
      to={to}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={({ isActive }) => `sidebar-item text-sm${collapsed ? " justify-center px-3" : ""}${isActive ? " active" : ""}`}
    >
      <Icon size={18} className="icon shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && to === "/email-inbox" && unreadEmailCount > 0 && (
        <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="Unread emails" />
      )}
    </NavLink>
  );
}

// Paths intentionally kept out of the sidebar because they now live in the header avatar menu.
const SIDEBAR_HIDDEN_PATHS = new Set(["/credits", "/billing", "/settings", "/admin"]);

function NavItems({ onClick, unreadEmailCount = 0, collapsed = false }) {
  const items = links.filter((item) => !SIDEBAR_HIDDEN_PATHS.has(item.to));
  const itemByPath = new Map(items.map((item) => [item.to, item]));
  const groupedPaths = new Set(navSections.flatMap((section) => section.items));
  const groupedSections = navSections.map((section) => ({
    ...section,
    items: section.items.map((to) => itemByPath.get(to)).filter(Boolean)
  }));
  const overflowItems = items.filter((item) => !groupedPaths.has(item.to));

  return (
    <>
      {[...groupedSections, ...(overflowItems.length ? [{ label: "ADMIN", items: overflowItems }] : [])].map((section) => (
        <div key={section.label} className="space-y-1">
          {!collapsed && <p className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{section.label}</p>}
          {section.items.map((item) => (
            <NavItem key={item.to} item={item} onClick={onClick} unreadEmailCount={unreadEmailCount} collapsed={collapsed} />
          ))}
        </div>
      ))}
    </>
  );
}

function CreditsChip({ onNavigate }) {
  const { balance, loading } = useCredits();
  const low = !loading && balance <= 0;
  return (
    <Link
      to={low ? "/billing" : "/credits"}
      onClick={onNavigate}
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
        low ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-hairline bg-white text-ink hover:bg-neutral-50"
      }`}
    >
      <span className="flex items-center gap-2"><Coins size={16} />{low ? "Get credits" : "Credits"}</span>
      <span className="font-semibold">{loading ? "…" : balance.toLocaleString()}</span>
    </Link>
  );
}

function recordMatches(query, values) {
  const q = query.trim().toLowerCase();
  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
}

function SearchBox({ user }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [data, setData] = useState({ agents: [], leads: [], calls: [] });

  const pageLinks = useMemo(
    () => (["admin", "super_admin"].includes(user?.role) ? [...links, { to: "/admin", label: "Admin", icon: Shield }] : links),
    [user?.role]
  );

  async function loadSearchData() {
    if (loaded || loading) return;
    setLoading(true);
    setSearchError("");
    const [agents, leads, calls] = await Promise.allSettled([api("/agents"), api("/leads"), api("/calls")]);
    setData({
      agents: agents.status === "fulfilled" && Array.isArray(agents.value) ? agents.value : [],
      leads: leads.status === "fulfilled" && Array.isArray(leads.value) ? leads.value : [],
      calls: calls.status === "fulfilled" && Array.isArray(calls.value) ? calls.value : []
    });
    if ([agents, leads, calls].some((result) => result.status === "rejected")) {
      setSearchError("Some results could not be loaded.");
    }
    setLoaded(true);
    setLoading(false);
  }

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];

    const pages = pageLinks
      .filter((item) => recordMatches(q, [item.label, item.to.replace("/", "")]))
      .slice(0, 4)
      .map((item) => ({
        id: `page-${item.to}`,
        type: "Page",
        title: item.label,
        subtitle: "Open page",
        to: item.to
      }));

    const agents = data.agents
      .filter((agent) => recordMatches(q, [agent.agentName, agent.name, agent.businessName, agent.businessCategory, agent.status, agent.language]))
      .slice(0, 5)
      .map((agent) => ({
        id: `agent-${agent._id}`,
        type: "Agent",
        title: agent.agentName || agent.name || "Agent",
        subtitle: agent.businessName || agent.businessCategory || "Agent details",
        to: `/agents/${agent._id}`
      }));

    const leads = data.leads
      .filter((lead) => recordMatches(q, [lead.name, lead.businessName, lead.phone, lead.email, lead.requirement, lead.status, lead.agentId?.agentName]))
      .slice(0, 5)
      .map((lead) => ({
        id: `lead-${lead._id}`,
        type: "Lead",
        title: lead.name || lead.businessName || lead.phone || "Lead",
        subtitle: [lead.phone, lead.email, lead.agentId?.agentName].filter(Boolean).join(" • ") || "Open leads",
        to: "/leads"
      }));

    const calls = data.calls
      .filter((call) => recordMatches(q, [call.agentId?.agentName, call.callerNumber, call.callingNumber, call.status, call.normalizedStatus, call.outcome]))
      .slice(0, 5)
      .map((call) => ({
        id: `call-${call._id}`,
        type: "Call",
        title: call.agentId?.agentName || call.callerNumber || "Call log",
        subtitle: [call.callerNumber, call.normalizedStatus || call.status, call.outcome].filter(Boolean).join(" • ") || "Open call logs",
        to: "/calls"
      }));

    return [...pages, ...agents, ...leads, ...calls].slice(0, 10);
  }, [data, pageLinks, query]);

  function openResult(result) {
    if (!result) return;
    navigate(result.to);
    setQuery("");
    setOpen(false);
  }

  function submitSearch(event) {
    event.preventDefault();
    if (!query.trim()) return;
    openResult(results[0] || { to: "/agents" });
  }

  return (
    <form className="relative hidden min-w-0 max-w-2xl flex-1 md:block" onSubmit={submitSearch}>
      <input
        className="h-12 rounded-[30px] min-h-0 border border-hairline bg-white py-0 pl-4 pr-11 text-sm shadow-soft focus:ring-0"
        placeholder="Search agents, leads, calls..."
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          loadSearchData();
        }}
        onFocus={() => {
          setOpen(true);
          loadSearchData();
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      <button className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-neutral-400 hover:bg-neutral-50 hover:text-ink" type="submit" aria-label="Search">
        <Search size={16} />
      </button>

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-hairline bg-white shadow-pop">
          {loading ? (
            <div className="px-4 py-3 text-sm text-neutral-500">Searching...</div>
          ) : results.length ? (
            <div className="max-h-96 overflow-y-auto py-2">
              {results.map((result) => (
                <button
                  key={result.id}
                  className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50"
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    openResult(result);
                  }}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-hairline bg-neutral-50 text-xs font-semibold text-neutral-500">{result.type[0]}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{result.title}</span>
                    <span className="block truncate text-xs text-neutral-500">{result.type} • {result.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-neutral-500">No results found.</div>
          )}
          {searchError && <div className="border-t border-hairline px-4 py-2 text-xs text-amber-600">{searchError}</div>}
        </div>
      )}
    </form>
  );
}

function SidebarContent({ initials, user, unreadEmailCount, onNavigate, onClose, onLogout, mobile = false, collapsed = false, onToggleCollapse }) {
  return (
    <>
      <div className={`mb-4 flex min-w-0 items-center gap-3 px-2 ${collapsed ? "justify-center" : "justify-between"}`}>
        <Link to="/dashboard" onClick={onNavigate} className={`flex min-w-0 items-center gap-3 ${collapsed ? "hidden" : ""}`}>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-ink text-white shadow-soft">
            <Headphones size={20} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight text-ink">AI Voice Agent</p>
            <p className="truncate text-xs font-medium text-neutral-500">Platform</p>
          </div>
        </Link>
        {mobile ? (
          <button className="rounded-xl border border-hairline p-2" onClick={onClose} aria-label="Close menu"><X size={18} /></button>
        ) : (
          <button
            className="rounded-xl border border-hairline p-2 text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-ink"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            type="button"
          >
            <PanelLeft size={18} />
          </button>
        )}
      </div>

      <div className={`mb-3 rounded-xl border border-hairline bg-neutral-50 p-2 ${collapsed ? "flex justify-center" : ""}`}>
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink text-xs font-semibold text-white">{initials}</div>
          <div className={`min-w-0 ${collapsed ? "hidden" : ""}`}>
            <p className="truncate text-xs font-semibold text-ink">{user?.email || user?.name || "User"}</p>
          </div>
          {!collapsed && <span className="ml-auto text-xs text-neutral-400">⌄</span>}
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        <NavItems onClick={onNavigate} unreadEmailCount={unreadEmailCount} collapsed={collapsed} />
      </nav>
    </>
  );
}

function ProfileMenu({ initials, user, onLogout }) {
  const [open, setOpen] = useState(false);
  const { balance, loading } = useCredits();
  const ref = useRef(null);
  const isAdmin = ["admin", "super_admin"].includes(user?.role);

  const menuLinks = [
    { to: "/credits", label: "Credits & Usage", icon: Coins },
    { to: "/billing", label: "Plans & Billing", icon: CreditCard },
    { to: "/settings", label: "Settings", icon: Settings },
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield }] : [])
  ];

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white transition hover:opacity-90"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title="Account"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-2xl border border-hairline bg-white shadow-pop" role="menu">
          <div className="flex items-center gap-3 border-b border-hairline p-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{initials}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{user?.name || user?.email || "User"}</p>
              <p className="truncate text-xs uppercase tracking-wide text-neutral-500">{user?.plan || "—"} plan</p>
            </div>
          </div>

          <Link
            to="/credits"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
            role="menuitem"
          >
            <span className="flex items-center gap-2.5 text-sm font-medium text-ink"><Coins size={16} />Credits</span>
            <span className="text-sm font-semibold text-ink">{loading ? "…" : balance.toLocaleString()}</span>
          </Link>

          <div className="border-t border-hairline py-1">
            {menuLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:text-ink"
                role="menuitem"
              >
                <Icon size={16} className="shrink-0" />
                {label}
              </Link>
            ))}
          </div>

          <div className="border-t border-hairline py-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-neutral-700 hover:bg-neutral-50 hover:text-ink"
              role="menuitem"
            >
              <LogOut size={16} className="shrink-0" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [unreadEmailCount, setUnreadEmailCount] = useState(0);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.name || "AI")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function signOut() {
    logout();
    navigate("/login");
  }

  async function loadUnreadEmailCount() {
    try {
      const result = await api("/email/unread-count");
      setUnreadEmailCount(result.count || 0);
    } catch {
      setUnreadEmailCount(0);
    }
  }

  useEffect(() => {
    loadUnreadEmailCount();
    const interval = setInterval(loadUnreadEmailCount, 30000);
    window.addEventListener("email-unread-count-changed", loadUnreadEmailCount);

    return () => {
      clearInterval(interval);
      window.removeEventListener("email-unread-count-changed", loadUnreadEmailCount);
    };
  }, []);

  return (
    <div className="app-shell min-h-screen overflow-x-hidden">
      {user?.impersonatedBy && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-white">
          You are viewing as {user.email}.
          <button
            className="rounded-lg bg-white px-3 py-1 text-amber-700"
            onClick={async () => {
              const { api, setToken } = await import("../lib/api.js");
              const data = await api("/admin/impersonation/stop", { method: "POST" });
              setToken(data.token);
              window.location.href = "/admin";
            }}
          >
            Stop impersonation
          </button>
        </div>
      )}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden border-r border-hairline bg-white p-4 transition-[width] duration-200 lg:flex lg:flex-col ${sidebarCollapsed ? "w-20" : "w-72"}`}>
        <SidebarContent
          initials={initials}
          user={user}
          unreadEmailCount={unreadEmailCount}
          onLogout={signOut}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
        />
      </aside>

      <div className={`min-w-0 max-w-full transition-[padding] duration-200 ${sidebarCollapsed ? "lg:pl-20" : "lg:pl-72"}`}>
        <header className="sticky top-0 z-20 border-b border-hairline bg-white/95 backdrop-blur">
          <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8">
            <button className="shrink-0 rounded-xl border border-hairline p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <SearchBox user={user} />
            <div className="flex-1 md:hidden" />
            <div className="hidden flex-1 md:block" />
            <button className="hidden rounded-xl border border-hairline bg-white p-2 text-neutral-600 hover:bg-neutral-50 sm:block" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <ProfileMenu initials={initials} user={user} onLogout={signOut} />
          </div>
        </header>

        <main className="mx-auto min-w-0 max-w-[1440px] overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 p-3 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <div className="flex h-full w-full max-w-[22rem] min-w-0 flex-col rounded-2xl bg-white p-4 shadow-pop" onClick={(event) => event.stopPropagation()}>
            <SidebarContent
              mobile
              initials={initials}
              user={user}
              unreadEmailCount={unreadEmailCount}
              onNavigate={() => setOpen(false)}
              onClose={() => setOpen(false)}
              onLogout={signOut}
            />
          </div>
        </div>
      )}
    </div>
  );
}
