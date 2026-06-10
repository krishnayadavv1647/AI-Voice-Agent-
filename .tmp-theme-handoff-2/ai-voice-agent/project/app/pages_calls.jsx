// app/pages_calls.jsx — Call Logs, Leads, Lead Finder, Appointments, Follow-ups, Import
function StatStrip({ items }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">{items.map((s) => <StatCard key={s.label} {...s} />)}</div>;
}

const TRANSCRIPT = [
  { who: "agent", t: "Namaste! Thanks for calling Vidya Coaching. How can I help with your admission today?" },
  { who: "caller", t: "Hi, I wanted to know about the JEE batch and the fees." },
  { who: "agent", t: "Great choice! Our 2026 JEE batch has weekly tests and daily doubt sessions. Fees are around ₹1,20,000 a year, and you may qualify for up to 90% scholarship." },
  { who: "caller", t: "That sounds good. Can I book a counselling session?" },
  { who: "agent", t: "Absolutely. May I have your name and a good number to confirm the slot?" },
];

function PageCalls() {
  const [f, setF] = React.useState("all");
  const [open, setOpen] = React.useState(null);
  const list = CALLS.filter((c) => f === "all" || c.status.toLowerCase() === f);
  return (
    <>
      <PageHead title="Call Logs" desc="Every inbound and outbound call with outcomes, sentiment and recordings."
        actions={<><Btn variant="ghost" icon="download">Export CSV</Btn><Btn variant="ghost" icon="filter">Filter</Btn></>} />
      <StatStrip items={[
        { label: "Total Calls", value: "4,790", icon: "phone", trend: "+23%" },
        { label: "Completed", value: "4,118", icon: "checkCircle", trend: "+19%" },
        { label: "Missed / Failed", value: "672", icon: "phoneOff", trend: "8%", trendDir: "down" },
        { label: "Avg Duration", value: "3:48", icon: "clock3", trend: "+0:12" },
      ]} />
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <Segmented options={[{ value: "all", label: "All" }, { value: "completed", label: "Completed" }, { value: "missed", label: "Missed" }, { value: "failed", label: "Failed" }]} value={f} onChange={setF} />
        <span className="text-[13px]" style={{ color: "var(--muted)" }}>{list.length} calls</span>
      </div>
      <Card className="overflow-hidden"><div className="ui-tablewrap ui-scroll"><table className="ui-table">
        <thead><tr><th>Caller</th><th className="hidden md:table-cell">Agent</th><th>Status</th><th className="hidden sm:table-cell">Sentiment</th><th>Outcome</th><th>Time</th><th className="text-right">Duration</th><th></th></tr></thead>
        <tbody>{list.map((c) => (
          <tr key={c.id} className="cursor-pointer" onClick={() => setOpen(c)}>
            <td><div className="flex items-center gap-3"><Avatar name={c.name === "Unknown" ? "?" : c.name} size={34} /><div className="leading-tight"><p className="font-bold" style={{ color: "var(--text)" }}>{c.name}</p><p className="text-[12px]" style={{ color: "var(--muted)" }}>{c.caller}</p></div></div></td>
            <td className="hidden md:table-cell">{c.agent.split(" – ")[0]}</td>
            <td><Badge tone={c.status}>{c.status}</Badge></td>
            <td className="hidden sm:table-cell">{c.sentiment}</td>
            <td>{c.outcome}</td><td>{c.date} · {c.time}</td>
            <td className="text-right font-bold" style={{ color: "var(--text)" }}>{c.duration}</td>
            <td className="text-right"><Btn variant="subtle" size="sm" icon="play" /></td>
          </tr>
        ))}</tbody>
      </table></div></Card>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? "Call with " + open.name : ""} desc={open ? open.agent + " · " + open.date + " · " + open.duration : ""} wide
        footer={<><Btn variant="ghost" icon="download">Download</Btn><Btn variant="primary" icon="users">Save as lead</Btn></>}>
        {open && <>
          <div className="flex flex-wrap gap-2 mb-5">
            <Badge tone={open.status}>{open.status}</Badge><Badge tone="muted">Sentiment: {open.sentiment}</Badge><Badge tone="ok">{open.outcome}</Badge>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl mb-5" style={{ background: "var(--accent-softer)", border: "1px solid var(--line)" }}>
            <Btn variant="primary" size="sm" icon="play" /><div className="flex-1 h-1.5 rounded-full" style={{ background: "#e3d6bd" }}><div className="h-full rounded-full" style={{ width: "38%", background: "var(--accent)" }} /></div><span className="text-[12px] font-bold" style={{ color: "var(--muted)" }}>1:34 / {open.duration}</span>
          </div>
          <h3 className="font-extrabold text-[14px] mb-3" style={{ color: "var(--text)" }}>Transcript</h3>
          <div className="flex flex-col gap-3">{TRANSCRIPT.map((l, i) => <div key={i} className={cx("flex", l.who === "caller" ? "justify-end" : "justify-start")}><div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, ...(l.who === "caller" ? { background: "var(--accent)", color: "#fff" } : { background: "var(--accent-softer)", color: "var(--text)" }) }}><span className="block text-[11px] font-bold mb-0.5" style={{ opacity: .7 }}>{l.who === "caller" ? open.name : "Agent"}</span>{l.t}</div></div>)}</div>
        </>}
      </Modal>
    </>
  );
}

function PageLeads() {
  const [f, setF] = React.useState("All");
  const cats = ["All", "New", "Contacted", "Interested", "Booked", "Not interested"];
  const list = LEADS.filter((l) => f === "All" || l.status === f);
  const fmt = (n) => n >= 100000 ? "₹" + (n / 100000).toFixed(1) + "L" : n ? "₹" + n.toLocaleString() : "—";
  return (
    <>
      <PageHead title="Leads" desc="Every conversation that turned into a qualified opportunity."
        actions={<><Btn variant="ghost" icon="download">Export</Btn><Btn variant="primary" icon="plus">Add lead</Btn></>} />
      <StatStrip items={[
        { label: "Total Leads", value: "1,259", icon: "users", trend: "+18%" },
        { label: "Interested", value: "428", icon: "star", trend: "+11%" },
        { label: "Booked", value: "327", icon: "calendar", trend: "+9%" },
        { label: "Pipeline value", value: "₹3.4Cr", icon: "wallet", trend: "+24%" },
      ]} />
      <div className="flex flex-wrap gap-2 mb-4">{cats.map((c) => <button key={c} onClick={() => setF(c)} className={cx("ui-tab", f === c && "ui-tab-on")}>{c}</button>)}</div>
      <Card className="overflow-hidden"><div className="ui-tablewrap ui-scroll"><table className="ui-table">
        <thead><tr><th>Lead</th><th className="hidden lg:table-cell">Requirement</th><th className="hidden sm:table-cell">Agent</th><th>Status</th><th className="hidden md:table-cell">Source</th><th className="text-right">Value</th></tr></thead>
        <tbody>{list.map((l) => (
          <tr key={l.id}>
            <td><div className="flex items-center gap-3"><Avatar name={l.name} size={36} /><div className="leading-tight"><p className="font-bold" style={{ color: "var(--text)" }}>{l.name}</p><p className="text-[12px]" style={{ color: "var(--muted)" }}>{l.phone}</p></div></div></td>
            <td className="hidden lg:table-cell max-w-[220px]"><span className="line-clamp-1">{l.req}</span></td>
            <td className="hidden sm:table-cell">{l.agent.split(" – ")[0]}</td>
            <td><Badge tone={l.status}>{l.status}</Badge></td>
            <td className="hidden md:table-cell">{l.source}</td>
            <td className="text-right font-bold" style={{ color: "var(--text)" }}>{fmt(l.value)}</td>
          </tr>
        ))}</tbody>
      </table></div></Card>
    </>
  );
}

function PageFinder() {
  const [q, setQ] = React.useState("Coaching centers in Kota");
  const [added, setAdded] = React.useState({});
  return (
    <>
      <PageHead title="Lead Finder" desc="Discover new businesses to prospect and push them straight into outreach." />
      <Card className="p-4 mb-6"><div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 flex-1 px-3.5 rounded-xl" style={{ background: "#fff", border: "1px solid var(--line)", height: 46 }}><Icon name="search" size={18} style={{ color: "var(--muted)" }} /><input value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-transparent outline-none text-[14px]" style={{ color: "var(--text)" }} /></div>
        <Select className="sm:w-44" options={["Any category", "Coaching Center", "Real Estate", "Healthcare", "Restaurant"]} />
        <Btn variant="primary" icon="search">Search</Btn>
      </div></Card>
      <div className="flex items-center justify-between mb-3"><span className="text-[13px] font-bold" style={{ color: "var(--muted)" }}>{FINDER.length} businesses found</span><Btn variant="ghost" size="sm" icon="upload">Add all to leads</Btn></div>
      <div className="grid gap-3">{FINDER.map((b) => (
        <Card key={b.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="ui-iconbox"><Icon name="building" size={22} /></span>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="font-bold text-[15px]" style={{ color: "var(--text)" }}>{b.business}</p><Badge tone="warn"><Icon name="star" size={11} />{b.rating}</Badge></div><p className="text-[13px]" style={{ color: "var(--muted)" }}>{b.category} · {b.location} · {b.phone}</p></div>
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" icon="phone">Call</Btn>
            <Btn variant={added[b.id] || b.contacted ? "soft" : "primary"} size="sm" icon={added[b.id] || b.contacted ? "check" : "plus"} onClick={() => setAdded((s) => ({ ...s, [b.id]: true }))}>{added[b.id] || b.contacted ? "Added" : "Add lead"}</Btn>
          </div>
        </Card>
      ))}</div>
    </>
  );
}

function PageAppointments() {
  const days = [["Jun 10", "Today"], ["Jun 11", "Tomorrow"], ["Jun 12", "Thursday"]];
  return (
    <>
      <PageHead title="Appointments" desc="Counselling sessions, site visits and callbacks booked by your agents."
        actions={<><Segmented options={[{ value: "list", label: "List" }, { value: "cal", label: "Calendar" }]} value="list" onChange={() => { }} /><Btn variant="primary" icon="plus">New</Btn></>} />
      <StatStrip items={[
        { label: "Upcoming", value: "18", icon: "calendar", trend: "+5" },
        { label: "Today", value: "4", icon: "clock3" },
        { label: "Confirmed", value: "12", icon: "checkCircle", trend: "67%" },
        { label: "No-show rate", value: "6%", icon: "alert", trend: "2%", trendDir: "down" },
      ]} />
      <div className="grid gap-6">{days.map(([d, lbl]) => {
        const items = APPTS.filter((a) => a.date === d);
        if (!items.length) return null;
        return <div key={d}><div className="flex items-center gap-2 mb-3"><h3 className="font-extrabold text-[15px]" style={{ color: "var(--text)" }}>{lbl}</h3><span className="text-[13px]" style={{ color: "var(--muted)" }}>· {d}</span></div>
          <div className="grid gap-3">{items.map((a) => (
            <Card key={a.id} className="p-4 flex items-center gap-4">
              <div className="text-center px-3 py-2 rounded-xl shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)", minWidth: 78 }}><p className="font-extrabold text-[15px]">{a.time.split(" ")[0]}</p><p className="text-[11px] font-bold">{a.time.split(" ")[1]}</p></div>
              <div className="min-w-0 flex-1"><p className="font-bold text-[15px]" style={{ color: "var(--text)" }}>{a.purpose}</p><p className="text-[13px]" style={{ color: "var(--muted)" }}>{a.name} · {a.agent.split(" – ")[0]}</p></div>
              <div className="hidden sm:flex items-center gap-2"><Badge tone="muted"><Icon name={a.mode === "Online" ? "globe" : a.mode === "Phone" ? "phone" : "mapPin"} size={12} />{a.mode}</Badge><Badge tone={a.status}>{a.status}</Badge></div>
              <Btn variant="subtle" size="sm" icon="moreV" />
            </Card>
          ))}</div>
        </div>;
      })}</div>
    </>
  );
}

function PageFollowups() {
  const [done, setDone] = React.useState({});
  return (
    <>
      <PageHead title="Follow-ups" desc="Stay on top of every promised callback and next step."
        actions={<Btn variant="primary" icon="plus">Add follow-up</Btn>} />
      <StatStrip items={[
        { label: "Open", value: "23", icon: "clock3" },
        { label: "Due today", value: "5", icon: "alert", trend: "Act now" },
        { label: "Overdue", value: "2", icon: "alert", trend: "−1", trendDir: "down" },
        { label: "Completed (7d)", value: "41", icon: "checkCircle", trend: "+18%" },
      ]} />
      <Card className="overflow-hidden p-2">
        {FOLLOWUPS.map((f, i) => (
          <div key={f.id} className="flex items-center gap-3 p-3" style={{ borderTop: i ? "1px solid var(--line-soft)" : "none", opacity: done[f.id] ? .5 : 1 }}>
            <button onClick={() => setDone((s) => ({ ...s, [f.id]: !s[f.id] }))} className="grid place-items-center shrink-0" style={{ width: 24, height: 24, borderRadius: 7, border: "2px solid " + (done[f.id] ? "var(--accent)" : "var(--line)"), background: done[f.id] ? "var(--accent)" : "transparent", color: "#fff" }}>{done[f.id] && <Icon name="check" size={14} stroke={3} />}</button>
            <div className="min-w-0 flex-1"><p className="font-bold text-[14.5px]" style={{ color: "var(--text)", textDecoration: done[f.id] ? "line-through" : "none" }}>{f.reason}</p><p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{f.lead} · {f.owner}</p></div>
            <Badge tone={f.status}>{f.due}</Badge>
            <Btn variant="subtle" size="sm" icon="phone" className="hidden sm:inline-flex" />
          </div>
        ))}
      </Card>
    </>
  );
}

function PageImport() {
  return (
    <>
      <PageHead title="Import Calls" desc="Bring in historical call records to analyze and build your CRM." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-8 flex flex-col items-center text-center border-dashed" style={{ borderWidth: 2, borderColor: "var(--accent)", background: "var(--accent-softer)" }}>
          <span className="ui-iconbox" style={{ width: 60, height: 60, borderRadius: 18 }}><Icon name="upload" size={28} /></span>
          <h3 className="mt-4 font-extrabold text-[17px]" style={{ color: "var(--text)" }}>Drop your CSV or recordings here</h3>
          <p className="text-[13.5px] mt-1 mb-5" style={{ color: "var(--muted)" }}>Supports .csv, .mp3, .wav · up to 200 MB per file</p>
          <Btn variant="primary" icon="folder">Browse files</Btn>
        </Card>
        <Card className="p-5"><h3 className="font-extrabold text-[15px] mb-3" style={{ color: "var(--text)" }}>How it works</h3>
          {["Upload call records or recordings", "We transcribe & analyze sentiment", "Leads are auto-extracted to your CRM"].map((s, i) => <div key={i} className="flex items-start gap-3 mb-3"><span className="grid place-items-center font-bold text-[12px] shrink-0" style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{i + 1}</span><p className="text-[13.5px]" style={{ color: "var(--text-2)" }}>{s}</p></div>)}
        </Card>
      </div>
      <h3 className="font-extrabold text-[15px] mt-7 mb-3" style={{ color: "var(--text)" }}>Recent imports</h3>
      <Card className="overflow-hidden"><table className="ui-table"><thead><tr><th>File</th><th>Records</th><th>Status</th><th>Date</th></tr></thead><tbody>
        {[["jan_outbound_calls.csv", "1,204", "Completed", "Jun 6"], ["clinic_recordings.zip", "318", "Completed", "Jun 3"], ["may_leads.csv", "640", "Processing", "Just now"]].map((r, i) => <tr key={i}><td className="font-bold" style={{ color: "var(--text)" }}><Icon name="fileText" size={15} className="inline mr-2" style={{ color: "var(--muted)" }} />{r[0]}</td><td>{r[1]}</td><td><Badge tone={r[2] === "Completed" ? "ok" : "warn"}>{r[2]}</Badge></td><td>{r[3]}</td></tr>)}
      </tbody></table></Card>
    </>
  );
}
Object.assign(window, { PageCalls, PageLeads, PageFinder, PageAppointments, PageFollowups, PageImport });
