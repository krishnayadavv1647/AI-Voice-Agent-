import {
  Bell,
  Bot,
  BookOpen,
  CreditCard,
  Gauge,
  Globe2,
  Headphones,
  Languages,
  LayoutTemplate,
  LogOut,
  Menu,
  MessageSquare,
  PhoneCall,
  PlusCircle,
  Search,
  Settings,
  Shield,
  Users,
  Workflow,
  X
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: Gauge },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/create-agent", label: "Create Agent", icon: PlusCircle },
  { to: "/calls", label: "Call Logs", icon: PhoneCall },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/messages", label: "Messages", icon: MessageSquare },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/voice-language", label: "Voice & Language", icon: Languages },
  { to: "/telephony-configuration", label: "Telephony Configuration", icon: PhoneCall },
  { to: "/dograh-settings", label: "Dograh Settings", icon: Workflow },
  { to: "/settings", label: "Settings", icon: Settings }
];

function NavItems({ onClick }) {
  const { user } = useAuth();
  const items = user?.role === "admin" ? [...links, { to: "/admin", label: "Admin", icon: Shield }] : links;

  return items.map(({ to, label, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `group flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
          isActive
            ? "bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow-lg shadow-brand-600/20"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
        }`
      }
    >
      <Icon size={18} className="shrink-0" />
      <span className="truncate">{label}</span>
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

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white/90 p-4 backdrop-blur-xl lg:flex lg:flex-col">
        <Link to="/dashboard" className="mb-6 flex min-w-0 items-center gap-3 px-2">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-lg shadow-brand-600/25">
            <Headphones size={22} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold tracking-tight text-slate-950">AI Voice Agent</p>
            <p className="truncate text-xs font-medium text-slate-500">Platform</p>
          </div>
        </Link>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          <NavItems />
        </nav>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-950 text-sm font-bold text-white">{initials}</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">{user?.name || "User"}</p>
              <p className="truncate text-xs uppercase tracking-wide text-slate-500">{user?.plan || "free"} plan</p>
            </div>
          </div>
          <button onClick={signOut} className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white hover:text-slate-950">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
          <div className="flex h-16 min-w-0 items-center gap-3 px-4 lg:px-8">
            <button className="rounded-xl border border-slate-200 p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-950">{pageTitle(location.pathname)}</p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">Create outbound AI calling agents, sync runs, and convert conversations into leads.</p>
            </div>
            <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
              <Search size={16} className="shrink-0 text-slate-400" />
              <input className="border-0 bg-transparent p-0 text-sm shadow-none focus:border-0 focus:ring-0" placeholder="Search agents, leads, calls..." />
            </div>
            <button className="hidden rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 sm:block" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <Link className="btn-primary hidden sm:inline-flex" to="/create-agent"><PlusCircle size={16} />Create Agent</Link>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-bold text-white">{initials}</div>
          </div>
        </header>

        <main className="mx-auto min-w-0 max-w-[1500px] overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 bg-slate-950/50 p-3 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <div className="flex h-full w-full max-w-sm flex-col rounded-3xl bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-600 text-white"><Globe2 size={20} /></div>
                <div>
                  <p className="font-bold text-slate-950">AI Voice Agent</p>
                  <p className="text-xs text-slate-500">Platform</p>
                </div>
              </div>
              <button className="rounded-xl border border-slate-200 p-2" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              <NavItems onClick={() => setOpen(false)} />
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
