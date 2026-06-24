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
  Megaphone,
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
  Workflow,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../state/AuthContext.jsx";
import { useCredits } from "../state/CreditsContext.jsx";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: Gauge },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/calls", label: "Call Logs", icon: PhoneCall },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
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
  { to: "/dograh-settings", label: "Dograh Settings", icon: Workflow },
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
    items: ["/agents", "/campaigns", "/leads", "/lead-finder", "/templates", "/voice-language"]
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
    items: ["/email-outreach", "/integrations", "/telephony-configuration", "/dograh-settings", "/credits", "/billing", "/settings"]
  }
];

function NavItem({ item, onClick, unreadEmailCount = 0 }) {
  const { to, label, icon: Icon } = item;

  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) => `sidebar-item text-sm${isActive ? " active" : ""}`}
    >
      <Icon size={18} className="icon shrink-0" />
      <span className="truncate">{label}</span>
      {to === "/email-inbox" && unreadEmailCount > 0 && (
        <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="Unread emails" />
      )}
    </NavLink>
  );
}

function NavItems({ onClick, unreadEmailCount = 0 }) {
  const { user } = useAuth();
  const items = ["admin", "super_admin"].includes(user?.role) ? [...links, { to: "/admin", label: "Admin", icon: Shield }] : links;
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
          <p className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{section.label}</p>
          {section.items.map((item) => (
            <NavItem key={item.to} item={item} onClick={onClick} unreadEmailCount={unreadEmailCount} />
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

function SidebarContent({ initials, user, unreadEmailCount, onNavigate, onClose, onLogout, mobile = false }) {
  return (
    <>
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3 px-2">
        <Link to="/dashboard" onClick={onNavigate} className="flex min-w-0 items-center gap-3">
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
          <button className="rounded-xl border border-hairline p-2 text-neutral-500" aria-label="Sidebar layout">
            <PanelLeft size={18} />
          </button>
        )}
      </div>

      <div className="mb-3 rounded-xl border border-hairline bg-neutral-50 p-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink text-xs font-semibold text-white">{initials}</div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink">{user?.email || user?.name || "User"}</p>
          </div>
          <span className="ml-auto text-xs text-neutral-400">⌄</span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        <NavItems onClick={onNavigate} unreadEmailCount={unreadEmailCount} />
      </nav>

      <div className="mt-4 rounded-2xl border border-hairline bg-neutral-50 p-3">
        <div className="mb-3 flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{initials}</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{user?.name || "User"}</p>
            <p className="truncate text-xs uppercase tracking-wide text-neutral-500">{user?.plan || "—"} plan</p>
          </div>
        </div>
        <CreditsChip onNavigate={onNavigate} />
        <button onClick={onLogout} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-neutral-600 hover:bg-white hover:text-ink">
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </>
  );
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-hairline bg-white p-4 lg:flex lg:flex-col">
        <SidebarContent initials={initials} user={user} unreadEmailCount={unreadEmailCount} onLogout={signOut} />
      </aside>

      <div className="min-w-0 max-w-full lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-hairline bg-white/95 backdrop-blur">
          <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8">
            <button className="shrink-0 rounded-xl border border-hairline p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <div className="relative hidden min-w-0 max-w-2xl flex-1 md:block">
              <input className="h-12  rounded-[30px] min-h-0 border border-hairline bg-white py-0 pl-4 pr-11 text-sm shadow-soft focus:ring-0" placeholder="Search agents, leads, calls..." />
              <Search size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400" />
            </div>
            <div className="flex-1 md:hidden" />
            <div className="hidden flex-1 md:block" />
            <button className="hidden rounded-xl border border-hairline bg-white p-2 text-neutral-600 hover:bg-neutral-50 sm:block" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{initials}</div>
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
