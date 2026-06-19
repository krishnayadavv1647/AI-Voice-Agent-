import {
  Bell,
  Bot,
  BookOpen,
  CreditCard,
  CalendarClock,
  Gauge,
  Globe2,
  Headphones,
  Mail,
  MailOpen,
  Megaphone,
  Languages,
  LayoutTemplate,
  LogOut,
  Menu,
  MessageSquare,
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
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useAuth } from "../state/AuthContext.jsx";

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
  { to: "/integrations/voice-providers", label: "Voice Providers", icon: Plug },
  { to: "/integrations/llm-providers", label: "LLM Providers", icon: MessageSquare },
  { to: "/telephony-configuration", label: "Telephony Configuration", icon: PhoneCall },
  { to: "/dograh-settings", label: "Dograh Settings", icon: Workflow },
  { to: "/settings", label: "Settings", icon: Settings }
];

function NavItems({ onClick, unreadEmailCount = 0 }) {
  const { user } = useAuth();
  const items = ["admin", "super_admin"].includes(user?.role) ? [...links, { to: "/admin", label: "Admin", icon: Shield }] : links;

  return items.map(({ to, label, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `group relative flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
          isActive
            ? "bg-neutral-100 text-ink before:absolute before:left-0 before:inset-y-2 before:w-0.5 before:rounded before:bg-brand-600"
            : "text-neutral-500 hover:bg-neutral-100 hover:text-ink"
        }`
      }
    >
      <Icon size={18} className="shrink-0" />
      <span className="truncate">{label}</span>
      {to === "/email-inbox" && unreadEmailCount > 0 && (
        <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-label="Unread emails" />
      )}
    </NavLink>
  ));
}

function pageTitle(pathname) {
  const match = links.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  if (pathname.startsWith("/agents/") && pathname.endsWith("/edit")) return "Edit Agent";
  if (pathname.startsWith("/agents/")) return "Agent Profile";
  return match?.label || "AI Voice Agent Platform";
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const [unreadEmailCount, setUnreadEmailCount] = useState(0);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
    <div className="min-h-screen overflow-x-hidden bg-canvas">
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
        <Link to="/dashboard" className="mb-6 flex min-w-0 items-center gap-3 px-2">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-white shadow-soft">
            <Headphones size={22} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight text-ink">AI Voice Agent</p>
            <p className="truncate text-xs font-medium text-neutral-500">Platform</p>
          </div>
        </Link>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          <NavItems unreadEmailCount={unreadEmailCount} />
        </nav>

        <div className="mt-4 rounded-2xl border border-hairline bg-neutral-50 p-3">
          <div className="mb-3 flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{initials}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{user?.name || "User"}</p>
              <p className="truncate text-xs uppercase tracking-wide text-neutral-500">{user?.plan || "free"} plan</p>
            </div>
          </div>
          <button onClick={signOut} className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-neutral-600 hover:bg-white hover:text-ink">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <div className="min-w-0 max-w-full lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-hairline bg-white/95 backdrop-blur">
          <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-2 px-4 py-2 sm:gap-3 sm:px-6 lg:px-8">
            <button className="shrink-0 rounded-xl border border-hairline p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{pageTitle(location.pathname)}</p>
              <p className="hidden truncate text-xs text-neutral-500 sm:block">Create outbound AI calling agents, sync runs, and convert conversations into leads.</p>
            </div>
            <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-xl border border-hairline bg-white px-3 py-2 shadow-soft md:flex">
              <Search size={16} className="shrink-0 text-neutral-400" />
              <input className="border-0 bg-transparent p-0 text-sm shadow-none focus:border-0 focus:ring-0" placeholder="Search agents, leads, calls..." />
            </div>
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
            <div className="mb-5 flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-ink text-white"><Globe2 size={20} /></div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">AI Voice Agent</p>
                  <p className="truncate text-xs text-neutral-500">Platform</p>
                </div>
              </div>
              <button className="rounded-xl border border-hairline p-2" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
            </div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              <NavItems onClick={() => setOpen(false)} unreadEmailCount={unreadEmailCount} />
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
