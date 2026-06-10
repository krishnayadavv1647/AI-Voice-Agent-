// app/shell.jsx — AppShell: sidebar nav, topbar, mobile drawer
const NAV = [
  { sec: "Overview" },
  { key: "dashboard", label: "Dashboard", icon: "gauge" },
  { sec: "Agents" },
  { key: "agents", label: "Agents", icon: "bot" },
  { key: "create", label: "Create Agent", icon: "plusCircle" },
  { key: "templates", label: "Templates", icon: "template" },
  { sec: "Engage" },
  { key: "calls", label: "Call Logs", icon: "phone" },
  { key: "leads", label: "Leads", icon: "users" },
  { key: "finder", label: "Lead Finder", icon: "search" },
  { key: "appointments", label: "Appointments", icon: "calendar" },
  { key: "followups", label: "Follow-ups", icon: "clock3" },
  { key: "import", label: "Import Calls", icon: "upload" },
  { sec: "Inbox" },
  { key: "messages", label: "Messages", icon: "message" },
  { key: "outreach", label: "Email Outreach", icon: "mail" },
  { key: "inbox", label: "Email Inbox", icon: "mailOpen" },
  { sec: "Configure" },
  { key: "knowledge", label: "Knowledge Base", icon: "book" },
  { key: "voice", label: "Voice & Language", icon: "languages" },
  { key: "telephony", label: "Telephony", icon: "phoneIn" },
  { key: "dograh", label: "Dograh Settings", icon: "workflow" },
  { key: "biopage", label: "Bio Page", icon: "globe" },
  { key: "settings", label: "Settings", icon: "settings" },
  { key: "billing", label: "Billing", icon: "card" },
  { sec: "Admin" },
  { key: "admin", label: "Admin", icon: "shield" },
];
const TITLES = Object.fromEntries(NAV.filter((n) => n.key).map((n) => [n.key, n.label]));

function Logo() {
  return (
    <div className="flex items-center gap-3 px-2">
      <span className="grid place-items-center text-white shrink-0" style={{ width: 42, height: 42, borderRadius: 13, background: "var(--accent)", boxShadow: "0 8px 18px rgba(189,125,52,.3)" }}>
        <Icon name="headphones" size={22} />
      </span>
      <div className="leading-tight">
        <p className="font-extrabold text-[16px]" style={{ color: "var(--text)", letterSpacing: "-0.01em" }}>VoiceFlow AI</p>
        <p className="text-[11.5px] font-semibold" style={{ color: "var(--muted)" }}>Agent Platform</p>
      </div>
    </div>
  );
}

function NavList({ route, go }) {
  return (
    <nav className="px-3 pb-4">
      {NAV.map((n, i) => n.sec ? (
        <div key={"s" + i} className="nav-sec">{n.sec}</div>
      ) : (
        <button key={n.key} className={cx("nav-item w-full text-left mb-0.5", route === n.key && "on")} onClick={() => go(n.key)}>
          <Icon name={n.icon} size={18} />
          <span className="truncate">{n.label}</span>
        </button>
      ))}
    </nav>
  );
}

function UserCard() {
  return (
    <div className="m-3 p-3 rounded-2xl flex items-center gap-3" style={{ background: "#f3e9d8", border: "1px solid var(--line)" }}>
      <Avatar name={USER.name} size={38} />
      <div className="min-w-0 leading-tight flex-1">
        <p className="font-bold text-[13.5px] truncate" style={{ color: "var(--text)" }}>{USER.name}</p>
        <p className="text-[11.5px] truncate" style={{ color: "var(--muted)" }}>{USER.plan} plan</p>
      </div>
      <Btn variant="subtle" size="sm" icon="logout" title="Sign out" />
    </div>
  );
}

function AppShell({ route, go, children }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  React.useEffect(() => { setOpen(false); }, [route]);
  return (
    <div className="shell">
      {/* sidebar */}
      <aside className={cx("side ui-scroll", open && "open")} style={{ overflowY: "auto" }}>
        <div className="pt-5 pb-3 px-3 sticky top-0" style={{ background: "var(--side)", zIndex: 2 }}>
          <div className="flex items-center justify-between">
            <Logo />
            <button className="lg:hidden p-2 rounded-lg" style={{ color: "var(--muted)" }} onClick={() => setOpen(false)}><Icon name="x" size={20} /></button>
          </div>
        </div>
        <NavList route={route} go={go} />
        <div className="mt-auto"><UserCard /></div>
      </aside>
      {open && <div className="fixed inset-0 z-30 lg:hidden" style={{ background: "rgba(44,33,23,.4)" }} onClick={() => setOpen(false)} />}

      {/* main */}
      <div className="content">
        <header className="topbar">
          <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8" style={{ height: 66 }}>
            <button className="lg:hidden p-2 -ml-1 rounded-lg" style={{ color: "var(--text)" }} onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
            <div className="min-w-0 flex-1 lg:flex-none">
              <p className="font-extrabold text-[16px] truncate" style={{ color: "var(--text)" }}>{TITLES[route] || "VoiceFlow AI"}</p>
            </div>
            <div className="hidden md:flex items-center gap-2 flex-1 max-w-md mx-auto px-3.5 rounded-xl" style={{ height: 42, background: "#fff", border: "1px solid var(--line)" }}>
              <Icon name="search" size={17} style={{ color: "var(--muted)" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents, leads, calls…" className="flex-1 bg-transparent outline-none text-[14px]" style={{ color: "var(--text)" }} />
              <kbd className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "#f1e7d6", color: "var(--muted)" }}>⌘K</kbd>
            </div>
            <div className="flex items-center gap-2 ml-auto lg:ml-0">
              <a href="Public Agent.html" target="_blank" rel="noreferrer"><Btn variant="ghost" size="md" icon="globe" className="hidden sm:inline-flex">Public page</Btn></a>
              <Btn variant="ghost" size="md" icon="bell" className="!px-0 !w-10" title="Notifications" />
              <Btn variant="primary" icon="plus" onClick={() => go("create")} className="hidden sm:inline-flex">Create Agent</Btn>
              <span className="sm:hidden"><Avatar name={USER.name} size={36} /></span>
            </div>
          </div>
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 mx-auto" style={{ maxWidth: 1320 }}>
          <div key={route} className="view-enter">{children}</div>
        </main>
      </div>
    </div>
  );
}
Object.assign(window, { AppShell, NAV, TITLES });
