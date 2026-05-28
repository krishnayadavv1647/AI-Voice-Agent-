import { BarChart3, BookOpen, Bot, CreditCard, Home, LogOut, Menu, PhoneCall, PlusCircle, Settings, Shield, Users } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/agents", label: "My Agents", icon: Bot },
  { to: "/create-agent", label: "Create Agent", icon: PlusCircle },
  { to: "/calls", label: "Call Logs", icon: PhoneCall },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  { to: "/billing", label: "Billing", icon: CreditCard },
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
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  ));
}

export default function AppShell() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function signOut() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white p-4 lg:block">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-600 text-white">
            <BarChart3 size={20} />
          </div>
          <div>
            <p className="font-bold text-ink">AI Voice Agent</p>
            <p className="text-xs text-slate-500">Dograh-powered SaaS</p>
          </div>
        </div>
        <nav className="space-y-1">
          <NavItems />
        </nav>
        <button onClick={signOut} className="absolute bottom-4 left-4 right-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
          <LogOut size={18} />
          Logout
        </button>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <button className="rounded-lg border border-slate-200 p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="hidden text-sm text-slate-500 lg:block">Build, test, publish, and track your voice agents.</div>
          <div className="text-right">
            <p className="text-sm font-semibold text-ink">{user?.name}</p>
            <p className="text-xs text-slate-500">{user?.plan || "free"} plan</p>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-80 bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-6 font-bold text-ink">AI Voice Agent</div>
            <nav className="space-y-1">
              <NavItems onClick={() => setOpen(false)} />
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
