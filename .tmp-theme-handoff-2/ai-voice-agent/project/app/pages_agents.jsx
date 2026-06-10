// app/pages_agents.jsx — Agents (list/details/test), Create wizard, Templates
function AgentCard({ a, go, onOpen }) {
  return (
    <Card className="p-5 flex flex-col">
      <div className="flex items-start gap-3">
        <span className="ui-iconbox"><Icon name="bot" size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-[15.5px] truncate" style={{ color: "var(--text)" }}>{a.name}</p>
          <p className="text-[13px] truncate" style={{ color: "var(--muted)" }}>{a.business}</p>
        </div>
        <Badge tone={a.status}>{a.status}</Badge>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        <Badge tone="muted">{a.type.replace(" Agent", "")}</Badge>
        <Badge tone="muted">{a.language}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4 mb-4">
        {[["Calls", a.calls.toLocaleString()], ["Leads", a.leads], ["Success", a.success + "%"]].map(([k, v]) => (
          <div key={k} className="text-center py-2.5 rounded-xl" style={{ background: "var(--accent-softer)" }}>
            <p className="font-extrabold text-[16px]" style={{ color: "var(--text)" }}>{v}</p><p className="text-[11px]" style={{ color: "var(--muted)" }}>{k}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-auto">
        <Btn variant="ghost" size="sm" icon="eye" className="flex-1" onClick={() => onOpen(a.id)}>Open</Btn>
        <Btn variant="soft" size="sm" icon="play" className="flex-1" onClick={() => onOpen(a.id, "test")}>Test</Btn>
        <Btn variant="ghost" size="sm" icon="moreV" />
      </div>
    </Card>
  );
}

function AgentDetails({ a, onBack, go, startTest }) {
  const [tab, setTab] = React.useState("overview");
  const calls = CALLS.filter((c) => c.agentId === a.id);
  return (
    <>
      <button className="flex items-center gap-2 text-[13.5px] font-bold mb-4" style={{ color: "var(--muted)" }} onClick={onBack}><Icon name="arrowLeft" size={16} /> Back to agents</button>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <span className="ui-iconbox" style={{ width: 60, height: 60, borderRadius: 18 }}><Icon name="bot" size={28} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5"><h1 className="text-[24px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>{a.name}</h1><Badge tone={a.status} dot>{a.status}</Badge></div>
          <p className="text-[14px]" style={{ color: "var(--muted)" }}>{a.business} · {a.type}</p>
        </div>
        <div className="flex gap-2"><Btn variant="ghost" icon="edit">Edit</Btn><Btn variant="primary" icon="play" onClick={startTest}>Test agent</Btn></div>
      </div>
      <Tabs tabs={[{ value: "overview", label: "Overview" }, { value: "config", label: "Configuration" }, { value: "calls", label: "Call Logs" }, { value: "kb", label: "Knowledge" }]} value={tab} onChange={setTab} className="mb-6" />

      {tab === "overview" && (
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Total Calls" value={a.calls.toLocaleString()} icon="phone" trend="+8%" />
            <StatCard label="Leads" value={a.leads} icon="users" trend="+12%" />
            <StatCard label="Success" value={a.success + "%"} icon="target" trend="+3%" />
            <StatCard label="Minutes" value={a.minutes.toLocaleString()} icon="clock3" trend="+6%" />
          </div>
          <Card className="p-5 sm:p-6">
            <h2 className="font-extrabold text-[17px] mb-4" style={{ color: "var(--text)" }}>Recent calls</h2>
            {calls.length ? <div className="-mx-5 sm:-mx-6 -mb-1"><table className="ui-table"><thead><tr><th>Caller</th><th>Outcome</th><th>Sentiment</th><th className="text-right">Duration</th></tr></thead><tbody>
              {calls.map((c) => <tr key={c.id}><td className="font-bold" style={{ color: "var(--text)" }}>{c.name}</td><td><Badge tone={c.status}>{c.outcome}</Badge></td><td>{c.sentiment}</td><td className="text-right font-bold" style={{ color: "var(--text)" }}>{c.duration}</td></tr>)}
            </tbody></table></div> : <EmptyState icon="phone" title="No calls yet" desc="This agent hasn't made any calls." />}
          </Card>
        </div>
      )}
      {tab === "config" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5 sm:p-6"><h2 className="font-extrabold text-[17px] mb-4" style={{ color: "var(--text)" }}>Agent profile</h2>
            <div className="flex flex-col">{[["Voice", a.voice], ["Language", a.language], ["Phone number", a.phone], ["Type", a.type], ["Created", a.created], ["Public link", "/a/" + a.slug]].map(([k, v], i) => (
              <div key={k} className="flex items-center justify-between py-3" style={{ borderTop: i ? "1px solid var(--line-soft)" : "none" }}><span className="text-[13.5px]" style={{ color: "var(--muted)" }}>{k}</span><span className="font-bold text-[13.5px]" style={{ color: "var(--text)" }}>{v}</span></div>
            ))}</div>
          </Card>
          <Card className="p-5 sm:p-6"><h2 className="font-extrabold text-[17px] mb-3" style={{ color: "var(--text)" }}>Primary goal</h2>
            <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-2)" }}>Greet the caller warmly, answer questions about courses, fees and scholarships, and capture qualified leads with name, phone and requirement. Offer to book a counselling appointment.</p>
            <h3 className="font-extrabold text-[14px] mt-5 mb-2" style={{ color: "var(--text)" }}>Captured fields</h3>
            <div className="flex flex-wrap gap-1.5">{["Name", "Phone", "Course interest", "Class/Level", "Preferred time"].map((f) => <Badge key={f} tone="muted">{f}</Badge>)}</div>
          </Card>
        </div>
      )}
      {tab === "calls" && <Card className="overflow-hidden"><div className="ui-tablewrap ui-scroll"><table className="ui-table"><thead><tr><th>Caller</th><th>Time</th><th>Outcome</th><th>Sentiment</th><th className="text-right">Duration</th></tr></thead><tbody>
        {calls.map((c) => <tr key={c.id}><td className="font-bold" style={{ color: "var(--text)" }}>{c.name}<br /><span className="font-normal text-[12px]" style={{ color: "var(--muted)" }}>{c.caller}</span></td><td>{c.date} · {c.time}</td><td><Badge tone={c.status}>{c.outcome}</Badge></td><td>{c.sentiment}</td><td className="text-right font-bold" style={{ color: "var(--text)" }}>{c.duration}</td></tr>)}
      </tbody></table></div></Card>}
      {tab === "kb" && <Card className="p-2"><div className="ui-tablewrap"><table className="ui-table"><thead><tr><th>Document</th><th>Chunks</th><th>Updated</th><th>Status</th></tr></thead><tbody>
        {KB.map((k) => <tr key={k.id}><td className="font-bold" style={{ color: "var(--text)" }}>{k.name}</td><td>{k.chunks}</td><td>{k.updated}</td><td><Badge tone={k.status === "Indexed" ? "ok" : "warn"}>{k.status}</Badge></td></tr>)}
      </tbody></table></div></Card>}
    </>
  );
}

function TestConsole({ a, onBack }) {
  const [msgs, setMsgs] = React.useState([{ r: "bot", t: "Namaste! This is " + a.name + " from " + a.business + ". How can I help you today?" }]);
  const [val, setVal] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [msgs, typing]);
  function send(text) {
    const v = (text ?? val).trim(); if (!v || typing) return; setVal(""); setMsgs((m) => [...m, { r: "user", t: v }]); setTyping(true);
    setTimeout(() => { setMsgs((m) => [...m, { r: "bot", t: "Sure! Based on what you've shared, I'd recommend our most popular batch. May I take your name and phone number to share full details and book a counselling slot?" }]); setTyping(false); }, 1100);
  }
  return (
    <>
      <button className="flex items-center gap-2 text-[13.5px] font-bold mb-4" style={{ color: "var(--muted)" }} onClick={onBack}><Icon name="arrowLeft" size={16} /> Back</button>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card className="flex flex-col overflow-hidden" style={{ height: "min(640px, calc(100vh - 220px))" }}>
          <div className="flex items-center gap-3 p-4" style={{ borderBottom: "1px solid var(--line)" }}><span className="ui-iconbox" style={{ width: 40, height: 40, borderRadius: 12 }}><Icon name="bot" size={20} /></span><div className="leading-tight"><p className="font-bold" style={{ color: "var(--text)" }}>{a.name}</p><p className="text-[12px]" style={{ color: typing ? "var(--accent-ink)" : "var(--muted)" }}>{typing ? "typing…" : "Test chat"}</p></div><Badge tone="info" dot>Sandbox</Badge></div>
          <div ref={ref} className="flex-1 ui-scroll p-4 flex flex-col gap-3" style={{ overflowY: "auto", background: "var(--accent-softer)" }}>
            {msgs.map((m, i) => <div key={i} className={cx("flex", m.r === "user" ? "justify-end" : "justify-start")}><div style={{ maxWidth: "82%", padding: "11px 14px", borderRadius: 16, fontSize: 14, lineHeight: 1.5, ...(m.r === "user" ? { background: "var(--accent)", color: "#fff", borderBottomRightRadius: 5 } : { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderBottomLeftRadius: 5 }) }}>{m.t}</div></div>)}
            {typing && <div style={{ alignSelf: "flex-start", background: "var(--panel)", border: "1px solid var(--line)", padding: "12px 14px", borderRadius: 16, color: "var(--muted)" }}>•••</div>}
          </div>
          <form className="flex gap-2 p-3" style={{ borderTop: "1px solid var(--line)" }} onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input className="ui-input" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Type a test message…" />
            <Btn variant="primary" icon="send" type="submit" />
          </form>
        </Card>
        <div className="grid gap-4 content-start">
          <Card className="p-5 text-center">
            <div className="relative grid place-items-center mx-auto mb-3" style={{ width: 96, height: 96 }}><span className="ui-iconbox" style={{ width: 96, height: 96, borderRadius: "50%" }}><Icon name="phone" size={36} /></span></div>
            <p className="font-bold" style={{ color: "var(--text)" }}>Test web call</p>
            <p className="text-[12.5px] mb-3" style={{ color: "var(--muted)" }}>Speak with {a.name} live in your browser.</p>
            <Btn variant="primary" icon="headphones" className="w-full">Start test call</Btn>
          </Card>
          <Card className="p-5">
            <p className="font-bold mb-3" style={{ color: "var(--text)" }}>Quick scenarios</p>
            <div className="flex flex-col gap-2">{["Ask about fees", "I want a scholarship", "Book a counselling slot", "What courses do you offer?"].map((s) => <button key={s} onClick={() => send(s)} className="text-left text-[13px] font-semibold p-2.5 rounded-xl" style={{ border: "1px solid var(--line-soft)", color: "var(--text-2)" }}>{s}</button>)}</div>
          </Card>
        </div>
      </div>
    </>
  );
}

function PageAgents({ go }) {
  const [sel, setSel] = React.useState(null);
  const [mode, setMode] = React.useState("list"); // list | details | test
  const [view, setView] = React.useState("grid");
  const agent = AGENTS.find((a) => a.id === sel);
  function open(id, m = "details") { setSel(id); setMode(m); }
  if (mode === "test" && agent) return <TestConsole a={agent} onBack={() => setMode("details")} />;
  if (mode === "details" && agent) return <AgentDetails a={agent} go={go} onBack={() => { setMode("list"); setSel(null); }} startTest={() => setMode("test")} />;
  return (
    <>
      <PageHead title="Agents" desc="Create, configure and monitor your AI calling agents."
        actions={<><div className="ui-seg"><button className={cx("ui-seg-btn", view === "grid" && "ui-seg-on")} onClick={() => setView("grid")}><Icon name="grid" size={15} /></button><button className={cx("ui-seg-btn", view === "list" && "ui-seg-on")} onClick={() => setView("list")}><Icon name="list" size={15} /></button></div><Btn variant="primary" icon="plus" onClick={() => go("create")}>Create Agent</Btn></>} />
      {view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{AGENTS.map((a, i) => <div key={a.id} className="pop-row" style={{ animationDelay: i * .04 + "s" }}><AgentCard a={a} go={go} onOpen={open} /></div>)}</div>
      ) : (
        <Card className="overflow-hidden"><div className="ui-tablewrap ui-scroll"><table className="ui-table"><thead><tr><th>Agent</th><th>Type</th><th>Calls</th><th>Leads</th><th>Success</th><th>Status</th><th></th></tr></thead><tbody>
          {AGENTS.map((a) => <tr key={a.id} className="cursor-pointer" onClick={() => open(a.id)}><td><div className="flex items-center gap-3"><span className="ui-iconbox" style={{ width: 36, height: 36, borderRadius: 11 }}><Icon name="bot" size={18} /></span><div className="leading-tight"><p className="font-bold" style={{ color: "var(--text)" }}>{a.name}</p><p className="text-[12px]" style={{ color: "var(--muted)" }}>{a.business}</p></div></div></td><td>{a.type.replace(" Agent", "")}</td><td>{a.calls.toLocaleString()}</td><td>{a.leads}</td><td>{a.success}%</td><td><Badge tone={a.status}>{a.status}</Badge></td><td className="text-right"><Btn variant="subtle" size="sm" icon="chevronRight" /></td></tr>)}
        </tbody></table></div></Card>
      )}
    </>
  );
}

const STEPS = ["Template", "Business", "Goals", "Voice", "Review"];
function PageCreate({ go }) {
  const [step, setStep] = React.useState(0);
  const [tpl, setTpl] = React.useState(null);
  return (
    <>
      <PageHead title="Create Agent" desc="Set up a new AI calling agent in five quick steps." />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => setStep(i)} className="flex items-center gap-3 p-3 rounded-xl text-left shrink-0 transition" style={{ background: i === step ? "var(--accent-soft)" : "transparent" }}>
              <span className="grid place-items-center font-bold text-[13px]" style={{ width: 28, height: 28, borderRadius: "50%", background: i < step ? "var(--accent)" : i === step ? "var(--accent)" : "#e6dcc8", color: i <= step ? "#fff" : "var(--muted)" }}>{i < step ? "✓" : i + 1}</span>
              <span className="font-bold text-[14px]" style={{ color: i === step ? "var(--accent-ink)" : "var(--text-2)" }}>{s}</span>
            </button>
          ))}
        </div>
        <Card className="p-6">
          {step === 0 && <div><h2 className="font-extrabold text-[18px] mb-1" style={{ color: "var(--text)" }}>Start from a template</h2><p className="text-[13.5px] mb-5" style={{ color: "var(--muted)" }}>Pick a ready-made agent or start blank.</p>
            <div className="grid sm:grid-cols-2 gap-3">{TEMPLATES.slice(0, 6).map((t) => <button key={t.id} onClick={() => setTpl(t.id)} className="flex items-start gap-3 p-4 rounded-xl text-left transition" style={{ border: "1px solid " + (tpl === t.id ? "var(--accent)" : "var(--line)"), background: tpl === t.id ? "var(--accent-softer)" : "var(--panel)", boxShadow: tpl === t.id ? "0 0 0 3px var(--accent-tint)" : "none" }}><span className="ui-iconbox" style={{ width: 40, height: 40, borderRadius: 12 }}><Icon name={t.icon} size={19} /></span><div><p className="font-bold text-[14px]" style={{ color: "var(--text)" }}>{t.name}</p><p className="text-[12.5px] mt-0.5" style={{ color: "var(--muted)" }}>{t.desc}</p></div></button>)}</div></div>}
          {step === 1 && <div className="grid sm:grid-cols-2 gap-4"><Field label="Business name" required><Input placeholder="e.g. Vidya Coaching Center" defaultValue="Vidya Coaching Center" /></Field><Field label="Category"><Select options={["Education", "Real Estate", "Healthcare", "Restaurant", "Banking", "E-commerce"]} /></Field><Field label="Location"><Input placeholder="City, State" defaultValue="Kota, Rajasthan" /></Field><Field label="Website"><Input placeholder="https://" /></Field><Field label="Business description" className="sm:col-span-2"><Textarea placeholder="What does the business do?" defaultValue="A coaching center for JEE, NEET and Foundation courses." /></Field></div>}
          {step === 2 && <div className="grid gap-4"><Field label="Primary goal" required><Textarea defaultValue="Answer course/fee questions and capture qualified admission leads." /></Field><Field label="Secondary goal"><Textarea defaultValue="Collect name, phone, course interest and preferred timing; offer counselling booking." /></Field><div className="grid sm:grid-cols-2 gap-4"><Field label="Tone"><Select options={["Professional", "Friendly", "Calm", "Energetic", "Supportive"]} /></Field><Field label="Personality"><Select options={["Warm", "Polite", "Confident", "Expert", "Conversational"]} /></Field></div></div>}
          {step === 3 && <div><h2 className="font-extrabold text-[18px] mb-4" style={{ color: "var(--text)" }}>Choose a voice</h2><div className="grid sm:grid-cols-2 gap-3">{VOICES.map((v) => <div key={v.id} className="flex items-center gap-3 p-3.5 rounded-xl" style={{ border: "1px solid var(--line)" }}><Btn variant="soft" size="sm" icon="play" /><div className="flex-1 leading-tight"><p className="font-bold text-[14px]" style={{ color: "var(--text)" }}>{v.name} {v.pop && <span className="text-[11px] font-bold" style={{ color: "var(--accent-ink)" }}>· Popular</span>}</p><p className="text-[12px]" style={{ color: "var(--muted)" }}>{v.trait} · {v.lang}</p></div></div>)}</div></div>}
          {step === 4 && <div className="text-center py-6"><span className="ui-iconbox mx-auto" style={{ width: 60, height: 60, borderRadius: 18 }}><Icon name="checkCircle" size={28} /></span><h2 className="mt-4 font-extrabold text-[20px]" style={{ color: "var(--text)" }}>Ready to launch</h2><p className="text-[14px] mt-1 mb-6" style={{ color: "var(--muted)" }}>Your agent is configured and ready to start taking calls.</p><Btn variant="primary" size="lg" icon="rocket" onClick={() => go("agents")}>Create agent</Btn></div>}
          {step < 4 && <div className="flex justify-between mt-7 pt-5" style={{ borderTop: "1px solid var(--line)" }}><Btn variant="ghost" icon="arrowLeft" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Btn><Btn variant="primary" iconRight="arrowRight" onClick={() => setStep(step + 1)}>Continue</Btn></div>}
        </Card>
      </div>
    </>
  );
}

function PageTemplates({ go }) {
  const cats = ["All", ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];
  const [cat, setCat] = React.useState("All");
  const list = TEMPLATES.filter((t) => cat === "All" || t.category === cat);
  return (
    <>
      <PageHead title="Templates" desc="Launch faster with pre-built agents tuned for common use cases." />
      <div className="flex flex-wrap gap-2 mb-5">{cats.map((c) => <button key={c} onClick={() => setCat(c)} className={cx("ui-tab", cat === c && "ui-tab-on")}>{c}</button>)}</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{list.map((t, i) => (
        <Card key={t.id} className="p-5 flex flex-col pop-row" style={{ animationDelay: i * .04 + "s" }}>
          <div className="flex items-center justify-between"><span className="ui-iconbox"><Icon name={t.icon} size={22} /></span><Badge tone="muted">{t.category}</Badge></div>
          <p className="font-extrabold text-[16px] mt-4" style={{ color: "var(--text)" }}>{t.name}</p>
          <p className="text-[13.5px] mt-1 flex-1" style={{ color: "var(--muted)" }}>{t.desc}</p>
          <div className="flex items-center justify-between mt-4"><span className="text-[12px]" style={{ color: "var(--muted)" }}><Icon name="users" size={13} className="inline mr-1" />{t.uses.toLocaleString()} uses</span><Btn variant="soft" size="sm" iconRight="arrowRight" onClick={() => go("create")}>Use</Btn></div>
        </Card>
      ))}</div>
    </>
  );
}
Object.assign(window, { PageAgents, PageCreate, PageTemplates });
