// app/pages_core.jsx — Dashboard, Admin, Welcome
function SectionCard({ title, sub, action, children, className = "" }) {
  return (
    <Card className={cx("p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div><h2 className="font-extrabold text-[17px]" style={{ color: "var(--text)" }}>{title}</h2>{sub && <p className="text-[13px] mt-0.5" style={{ color: "var(--muted)" }}>{sub}</p>}</div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function PageDashboard({ go }) {
  const stats = [
    { label: "Total Calls", value: "4,790", icon: "phone", trend: "+23%" },
    { label: "Active Agents", value: "4 / 6", icon: "bot", trend: "+1" },
    { label: "Leads Captured", value: "1,259", icon: "users", trend: "+18%" },
    { label: "Success Rate", value: "88%", icon: "target", trend: "+4%" },
  ];
  const donut = [
    { color: "var(--accent)", pct: 34, label: "Interested" },
    { color: "#5b7c5a", pct: 26, label: "Booked" },
    { color: "#c9a15a", pct: 22, label: "Contacted" },
    { color: "#d9cbb4", pct: 18, label: "New" },
  ];
  return (
    <>
      <PageHead title="Dashboard" desc="Monitor outbound AI calls, lead capture and agent performance from one control room."
        actions={<><Btn variant="ghost" icon="download">Export</Btn><Btn variant="primary" icon="plus" onClick={() => go("create")}>Create Agent</Btn></>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        {stats.map((s, i) => <div key={s.label} className="pop-row" style={{ animationDelay: i * .05 + "s" }}><StatCard {...s} /></div>)}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr] mb-6">
        <SectionCard title="Call Volume" sub="Outbound calls · last 14 days" action={<Badge tone="ok" dot>Live</Badge>}>
          <Bars data={CALL_VOLUME} height={210} />
          <div className="flex justify-between mt-3 text-[11.5px]" style={{ color: "var(--muted)" }}><span>May 27</span><span>Jun 2</span><span>Jun 9</span></div>
        </SectionCard>
        <SectionCard title="Lead Status" sub="From captured conversations">
          <div className="flex flex-col items-center gap-5">
            <Donut segments={donut} value="1,259" label="Total leads" />
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 w-full">
              {donut.map((d) => <div key={d.label} className="flex items-center gap-2 text-[13px]"><span style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} /><span className="flex-1" style={{ color: "var(--text-2)" }}>{d.label}</span><span className="font-bold" style={{ color: "var(--text)" }}>{d.pct}%</span></div>)}
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <SectionCard title="Recent Calls" sub="Latest activity across all agents" action={<Btn variant="subtle" size="sm" iconRight="arrowRight" onClick={() => go("calls")}>View all</Btn>}>
          <div className="-mx-5 sm:-mx-6 -mb-1">
            <table className="ui-table">
              <thead><tr><th>Caller</th><th className="hidden sm:table-cell">Agent</th><th>Outcome</th><th className="text-right">Duration</th></tr></thead>
              <tbody>
                {CALLS.slice(0, 6).map((c) => (
                  <tr key={c.id}>
                    <td><div className="flex items-center gap-3"><Avatar name={c.name === "Unknown" ? "?" : c.name} size={34} /><div className="leading-tight"><p className="font-bold" style={{ color: "var(--text)" }}>{c.name}</p><p className="text-[12px]" style={{ color: "var(--muted)" }}>{c.caller}</p></div></div></td>
                    <td className="hidden sm:table-cell">{c.agent.split(" – ")[0]}</td>
                    <td><Badge tone={c.status}>{c.outcome}</Badge></td>
                    <td className="text-right font-bold" style={{ color: "var(--text)" }}>{c.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
        <SectionCard title="Top Agents" sub="By leads this month" action={<Btn variant="subtle" size="sm" iconRight="arrowRight" onClick={() => go("agents")}>All</Btn>}>
          <div className="flex flex-col gap-2.5">
            {[...AGENTS].filter(a => a.leads > 0).sort((a, b) => b.leads - a.leads).slice(0, 5).map((a) => (
              <button key={a.id} onClick={() => go("agents")} className="flex items-center gap-3 p-2.5 rounded-xl text-left transition" style={{ border: "1px solid var(--line-soft)" }}>
                <span className="ui-iconbox" style={{ width: 38, height: 38, borderRadius: 11 }}><Icon name="bot" size={18} /></span>
                <div className="min-w-0 flex-1 leading-tight"><p className="font-bold text-[13.5px] truncate" style={{ color: "var(--text)" }}>{a.name}</p><p className="text-[12px] truncate" style={{ color: "var(--muted)" }}>{a.business}</p></div>
                <div className="text-right"><p className="font-extrabold text-[15px]" style={{ color: "var(--text)" }}>{a.leads}</p><p className="text-[11px]" style={{ color: "var(--muted)" }}>leads</p></div>
              </button>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function PageAdmin() {
  return (
    <>
      <PageHead title="Admin" desc="Organizations, plans and platform health across all tenants."
        actions={<Btn variant="primary" icon="plus">Add organization</Btn>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <StatCard label="Organizations" value="124" icon="building" trend="+9" />
        <StatCard label="Active Agents" value="386" icon="bot" trend="+22" />
        <StatCard label="Monthly Revenue" value="₹14.2L" icon="wallet" trend="+12%" />
        <StatCard label="Calls / day" value="38,420" icon="phone" trend="+6%" />
      </div>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-5"><h2 className="font-extrabold text-[17px]" style={{ color: "var(--text)" }}>Organizations</h2><Btn variant="ghost" size="sm" icon="filter">Filter</Btn></div>
        <div className="ui-tablewrap ui-scroll">
          <table className="ui-table">
            <thead><tr><th>Organization</th><th>Plan</th><th>Users</th><th>Agents</th><th>MRR</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {ADMIN_ORGS.map((o) => (
                <tr key={o.id}>
                  <td><div className="flex items-center gap-3"><Avatar name={o.name} size={34} /><span className="font-bold" style={{ color: "var(--text)" }}>{o.name}</span></div></td>
                  <td><Badge tone="info">{o.plan}</Badge></td>
                  <td>{o.users}</td><td>{o.agents}</td>
                  <td className="font-bold" style={{ color: "var(--text)" }}>{o.mrr}</td>
                  <td><Badge tone={o.status === "Past due" ? "danger" : o.status === "Trial" ? "warn" : "ok"}>{o.status}</Badge></td>
                  <td className="text-right"><Btn variant="subtle" size="sm" icon="moreV" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function PageWelcome({ go }) {
  return (
    <div className="max-w-2xl mx-auto text-center py-10">
      <span className="ui-iconbox mx-auto" style={{ width: 64, height: 64, borderRadius: 20 }}><Icon name="rocket" size={30} /></span>
      <h1 className="mt-5 text-[32px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>Welcome to VoiceFlow AI</h1>
      <p className="mt-2 text-[15px]" style={{ color: "var(--muted)" }}>Launch your first AI calling agent in under five minutes.</p>
      <div className="mt-7"><Btn variant="primary" size="lg" icon="plus" onClick={() => go("create")}>Create your first agent</Btn></div>
    </div>
  );
}
Object.assign(window, { PageDashboard, PageAdmin, PageWelcome });
