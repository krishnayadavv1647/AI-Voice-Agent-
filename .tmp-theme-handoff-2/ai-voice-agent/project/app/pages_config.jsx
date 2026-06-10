// app/pages_config.jsx — Knowledge, Voice, Telephony, Dograh, Bio Page, Settings, Billing
function Setting({ title, desc, children, first }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-4" style={{ borderTop: first ? "none" : "1px solid var(--line-soft)" }}>
      <div className="flex-1 min-w-0"><p className="font-bold text-[14px]" style={{ color: "var(--text)" }}>{title}</p>{desc && <p className="text-[12.5px] mt-0.5" style={{ color: "var(--muted)" }}>{desc}</p>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PageKnowledge() {
  return (
    <>
      <PageHead title="Knowledge Base" desc="Documents your agents use to answer questions accurately."
        actions={<Btn variant="primary" icon="upload">Upload document</Btn>} />
      <StatStrip items={[
        { label: "Documents", value: "4", icon: "fileText" },
        { label: "Indexed chunks", value: "128", icon: "grid", trend: "Ready" },
        { label: "Coverage", value: "92%", icon: "target", trend: "+5%" },
        { label: "Last sync", value: "2m ago", icon: "refresh" },
      ]} />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden"><div className="ui-tablewrap"><table className="ui-table"><thead><tr><th>Document</th><th>Type</th><th>Size</th><th>Chunks</th><th>Status</th><th></th></tr></thead><tbody>
          {KB.map((k) => <tr key={k.id}><td className="font-bold" style={{ color: "var(--text)" }}><Icon name="fileText" size={15} className="inline mr-2" style={{ color: "var(--muted)" }} />{k.name}</td><td><Badge tone="muted">{k.type}</Badge></td><td>{k.size}</td><td>{k.chunks || "—"}</td><td><Badge tone={k.status === "Indexed" ? "ok" : "warn"} dot>{k.status}</Badge></td><td className="text-right"><Btn variant="subtle" size="sm" icon="trash" /></td></tr>)}
        </tbody></table></div></Card>
        <Card className="p-5"><h3 className="font-extrabold text-[15px] mb-1" style={{ color: "var(--text)" }}>Test the knowledge base</h3><p className="text-[12.5px] mb-4" style={{ color: "var(--muted)" }}>Ask a question to see what your agent would retrieve.</p>
          <Textarea placeholder="e.g. What is the fee for the JEE batch?" defaultValue="What scholarships are available?" />
          <Btn variant="primary" icon="sparkle" className="w-full mt-3">Search knowledge</Btn>
          <div className="mt-4 p-3 rounded-xl text-[13px] leading-relaxed" style={{ background: "var(--accent-softer)", border: "1px solid var(--line)", color: "var(--text-2)" }}><span className="font-bold" style={{ color: "var(--accent-ink)" }}>Found in “Scholarship (SCALE) Policy”:</span> Up to 90% tuition waiver based on the SCALE test score and prior academics; merit & need-based options also available.</div>
        </Card>
      </div>
    </>
  );
}

function PageVoice() {
  const [sel, setSel] = React.useState("v1");
  return (
    <>
      <PageHead title="Voice & Language" desc="Pick how your agents sound and which languages they speak." />
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div>
          <h3 className="font-extrabold text-[15px] mb-3" style={{ color: "var(--text)" }}>Voice library</h3>
          <div className="grid sm:grid-cols-2 gap-3">{VOICES.map((v) => (
            <button key={v.id} onClick={() => setSel(v.id)} className="flex items-center gap-3 p-4 rounded-2xl text-left transition" style={{ border: "1px solid " + (sel === v.id ? "var(--accent)" : "var(--line)"), background: sel === v.id ? "var(--accent-softer)" : "var(--panel)", boxShadow: sel === v.id ? "0 0 0 3px var(--accent-tint)" : "var(--shadow-sm)" }}>
              <Btn variant={sel === v.id ? "primary" : "soft"} size="sm" icon="play" />
              <div className="flex-1 leading-tight"><p className="font-bold text-[14.5px]" style={{ color: "var(--text)" }}>{v.name} {v.pop && <Badge tone="warn">Popular</Badge>}</p><p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{v.trait} · {v.lang}</p></div>
              {sel === v.id && <Icon name="checkCircle" size={20} style={{ color: "var(--accent)" }} />}
            </button>
          ))}</div>
        </div>
        <Card className="p-5 content-start"><h3 className="font-extrabold text-[15px] mb-2" style={{ color: "var(--text)" }}>Speech settings</h3>
          <Setting first title="Primary language"><Select options={["English", "Hindi", "Hinglish", "Hindi + English"]} /></Setting>
          <Setting title="Speaking rate" desc="0.9×"><input type="range" defaultValue="55" style={{ width: 120, accentColor: "var(--accent)" }} /></Setting>
          <Setting title="Pitch" desc="Neutral"><input type="range" defaultValue="50" style={{ width: 120, accentColor: "var(--accent)" }} /></Setting>
          <Setting title="Filler words" desc="Natural ‘umm’, ‘okay’"><Toggle checked onChange={() => { }} /></Setting>
          <Setting title="Interruption handling"><Toggle checked onChange={() => { }} /></Setting>
          <Btn variant="primary" className="w-full mt-4">Save voice settings</Btn>
        </Card>
      </div>
    </>
  );
}

function PageTelephony() {
  return (
    <>
      <PageHead title="Telephony Configuration" desc="Connect phone numbers and carriers to power your calls."
        actions={<Btn variant="primary" icon="plus">Buy number</Btn>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5"><div className="flex items-center justify-between mb-4"><h3 className="font-extrabold text-[15px]" style={{ color: "var(--text)" }}>Phone numbers</h3><Badge tone="ok" dot>2 active</Badge></div>
          {[["+91 80 4710 2201", "Vidya Coaching", "Inbound + Outbound"], ["+91 80 4710 2202", "Nexa Realty", "Outbound"], ["+1 415 555 0142", "US toll-free", "Inbound"]].map((n, i) => (
            <div key={i} className="flex items-center gap-3 py-3" style={{ borderTop: i ? "1px solid var(--line-soft)" : "none" }}><span className="ui-iconbox" style={{ width: 38, height: 38, borderRadius: 11 }}><Icon name="phoneIn" size={18} /></span><div className="flex-1 leading-tight"><p className="font-bold text-[14px]" style={{ color: "var(--text)" }}>{n[0]}</p><p className="text-[12px]" style={{ color: "var(--muted)" }}>{n[1]} · {n[2]}</p></div><Btn variant="subtle" size="sm" icon="moreV" /></div>
          ))}
        </Card>
        <Card className="p-5"><h3 className="font-extrabold text-[15px] mb-4" style={{ color: "var(--text)" }}>Carrier connection</h3>
          <Field label="Provider" className="mb-3"><Select options={["Twilio", "Plivo", "Exotel", "Telnyx"]} /></Field>
          <Field label="Account SID" className="mb-3"><Input defaultValue="AC••••••••••••••••••••3f9" /></Field>
          <Field label="Auth token" className="mb-3"><Input type="password" defaultValue="passwordtoken" /></Field>
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: "var(--ok-bg)", color: "var(--ok-tx)" }}><Icon name="checkCircle" size={18} /><span className="text-[13px] font-bold">Connected · verified 2 days ago</span></div>
          <Btn variant="ghost" className="w-full mt-4" icon="refresh">Test connection</Btn>
        </Card>
      </div>
    </>
  );
}

function PageDograh() {
  return (
    <>
      <PageHead title="Dograh Settings" desc="Manage your Dograh workflow engine connection and credits." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2"><div className="flex items-center gap-3 mb-5"><span className="ui-iconbox"><Icon name="workflow" size={22} /></span><div><p className="font-extrabold text-[16px]" style={{ color: "var(--text)" }}>Dograh Workflow Engine</p><p className="text-[13px]" style={{ color: "var(--muted)" }}>Orchestrates call flows, tools and integrations.</p></div><Badge tone="ok" dot>Connected</Badge></div>
          <Field label="Workspace ID" className="mb-3"><Input defaultValue="ws_vidya_8841" /></Field>
          <Field label="API endpoint" className="mb-3"><Input defaultValue="https://api.dograh.io/v1" /></Field>
          <Field label="Webhook URL" hint="We'll POST call events here."><Input defaultValue="https://hooks.voiceflow.ai/dograh/8841" /></Field>
          <div className="mt-4"><Setting first title="Auto-sync runs" desc="Pull workflow runs every 5 minutes"><Toggle checked onChange={() => { }} /></Setting><Setting title="Push transcripts to Dograh"><Toggle checked onChange={() => { }} /></Setting></div>
        </Card>
        <div className="grid gap-5 content-start">
          <Card className="p-5 text-center"><p className="text-[13px] font-bold" style={{ color: "var(--muted)" }}>Credits remaining</p><p className="text-[34px] font-extrabold my-1" style={{ color: "var(--text)" }}>18,240</p><div className="h-2 rounded-full my-3" style={{ background: "#e3d6bd" }}><div className="h-full rounded-full" style={{ width: "62%", background: "var(--accent)" }} /></div><p className="text-[12px]" style={{ color: "var(--muted)" }}>62% of monthly allowance</p><Btn variant="soft" className="w-full mt-4" icon="plus">Top up</Btn></Card>
          <Card className="p-5"><p className="font-bold text-[14px] mb-3" style={{ color: "var(--text)" }}>Recent runs</p>{[["Admission flow", "ok"], ["Lead qualify", "ok"], ["Fee inquiry", "warn"]].map((r, i) => <div key={i} className="flex items-center justify-between py-2 text-[13px]"><span style={{ color: "var(--text-2)" }}>{r[0]}</span><Badge tone={r[1]}>{r[1] === "ok" ? "Success" : "Retried"}</Badge></div>)}</Card>
        </div>
      </div>
    </>
  );
}

function PageBioPage() {
  const [title, setTitle] = React.useState("Coaching Center AI");
  const [desc, setDesc] = React.useState("Your intelligent admissions advisor for courses, fees and scholarships.");
  return (
    <>
      <PageHead title="Bio Page" desc="A public mini-site for your agent — share one link everywhere."
        actions={<><Btn variant="ghost" icon="link">Copy link</Btn><a href="Public Agent.html" target="_blank" rel="noreferrer"><Btn variant="primary" icon="globe">View live</Btn></a></>} />
      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <Card className="p-5"><h3 className="font-extrabold text-[15px] mb-4" style={{ color: "var(--text)" }}>Page content</h3>
          <Field label="Headline" className="mb-3"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Description" className="mb-3"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Theme"><Select options={["Warm (cream/gold)", "Cool (blue/violet)", "Minimal"]} /></Field><Field label="Public URL"><Input defaultValue="/a/vidya-coaching" /></Field></div>
          <h3 className="font-extrabold text-[15px] mt-5 mb-2" style={{ color: "var(--text)" }}>Enabled actions</h3>
          <Setting first title="Live chat"><Toggle checked onChange={() => { }} /></Setting><Setting title="Web voice call"><Toggle checked onChange={() => { }} /></Setting><Setting title="Book appointment"><Toggle checked onChange={() => { }} /></Setting>
        </Card>
        <div>
          <p className="text-[12.5px] font-bold mb-2" style={{ color: "var(--muted)" }}>LIVE PREVIEW</p>
          <Card className="p-6 text-center" style={{ background: "linear-gradient(180deg,#fbf2e4,#fffaf2)" }}>
            <span className="ui-iconbox mx-auto" style={{ width: 72, height: 72, borderRadius: "50%" }}><Icon name="headphones" size={32} /></span>
            <Badge tone="warn" className="mt-3">AI Assistant</Badge>
            <h2 className="text-[24px] font-extrabold mt-3 leading-tight" style={{ color: "var(--text)" }}>{title}</h2>
            <p className="text-[13.5px] mt-2" style={{ color: "var(--muted)" }}>{desc}</p>
            <div className="flex flex-col gap-2 mt-5"><Btn variant="primary" className="w-full" icon="message">Start Conversation</Btn><Btn variant="ghost" className="w-full" icon="calendar">Book Appointment</Btn></div>
          </Card>
        </div>
      </div>
    </>
  );
}

function PageSettings() {
  const [tab, setTab] = React.useState("profile");
  return (
    <>
      <PageHead title="Settings" desc="Manage your account, team and integrations." tabs={[{ value: "profile", label: "Profile" }, { value: "team", label: "Team" }, { value: "notif", label: "Notifications" }, { value: "api", label: "API Keys" }, { value: "security", label: "Security" }]} tab={tab} onTab={setTab} />
      {tab === "profile" && <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="p-5"><h3 className="font-extrabold text-[15px] mb-4" style={{ color: "var(--text)" }}>Account details</h3>
          <div className="grid sm:grid-cols-2 gap-4"><Field label="Full name"><Input defaultValue={USER.name} /></Field><Field label="Email"><Input defaultValue={USER.email} /></Field><Field label="Organization"><Input defaultValue={USER.org} /></Field><Field label="Phone"><Input defaultValue="+91 98290 00001" /></Field></div>
          <Btn variant="primary" className="mt-5">Save changes</Btn></Card>
        <Card className="p-5 text-center"><Avatar name={USER.name} size={84} tone="var(--accent)" /><p className="font-extrabold text-[16px] mt-3" style={{ color: "var(--text)" }}>{USER.name}</p><p className="text-[13px]" style={{ color: "var(--muted)" }}>{USER.email}</p><Btn variant="ghost" size="sm" className="mt-4" icon="upload">Change photo</Btn></Card>
      </div>}
      {tab === "team" && <Card className="overflow-hidden"><div className="flex items-center justify-between p-5"><h3 className="font-extrabold text-[15px]" style={{ color: "var(--text)" }}>Team members</h3><Btn variant="primary" size="sm" icon="plus">Invite</Btn></div><table className="ui-table"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
        {[["Rishi Malhotra", "Owner", "ok"], ["Neha Gupta", "Admin", "ok"], ["Aman Joshi", "Agent", "ok"], ["Pooja Rao", "Agent", "warn"]].map((m, i) => <tr key={i}><td><div className="flex items-center gap-3"><Avatar name={m[0]} size={34} /><span className="font-bold" style={{ color: "var(--text)" }}>{m[0]}</span></div></td><td>{m[1]}</td><td><Badge tone={m[2]}>{m[2] === "ok" ? "Active" : "Invited"}</Badge></td><td className="text-right"><Btn variant="subtle" size="sm" icon="moreV" /></td></tr>)}
      </tbody></table></Card>}
      {tab === "notif" && <Card className="p-5"><h3 className="font-extrabold text-[15px] mb-2" style={{ color: "var(--text)" }}>Notifications</h3>{[["New lead captured", "Email + push"], ["Missed / failed call", "Push"], ["Daily summary", "Email"], ["Weekly performance report", "Email"], ["Billing & invoices", "Email"]].map((n, i) => <Setting key={i} first={i === 0} title={n[0]} desc={n[1]}><Toggle checked={i !== 3} onChange={() => { }} /></Setting>)}</Card>}
      {tab === "api" && <Card className="p-5"><h3 className="font-extrabold text-[15px] mb-4" style={{ color: "var(--text)" }}>API keys</h3>{[["Production", "vf_live_••••••••8a21", "ok"], ["Sandbox", "vf_test_••••••••11c4", "info"]].map((k, i) => <div key={i} className="flex items-center gap-3 py-3" style={{ borderTop: i ? "1px solid var(--line-soft)" : "none" }}><span className="ui-iconbox" style={{ width: 38, height: 38, borderRadius: 11 }}><Icon name="key" size={18} /></span><div className="flex-1 leading-tight"><p className="font-bold text-[14px]" style={{ color: "var(--text)" }}>{k[0]}</p><p className="text-[12.5px] font-mono" style={{ color: "var(--muted)" }}>{k[1]}</p></div><Badge tone={k[2]}>{k[2] === "ok" ? "Active" : "Test"}</Badge><Btn variant="subtle" size="sm" icon="copy" /></div>)}<Btn variant="ghost" className="mt-4" icon="plus">Generate new key</Btn></Card>}
      {tab === "security" && <Card className="p-5"><h3 className="font-extrabold text-[15px] mb-2" style={{ color: "var(--text)" }}>Security</h3><Setting first title="Two-factor authentication" desc="Add an extra layer of security"><Toggle checked onChange={() => { }} /></Setting><Setting title="Single sign-on (SSO)" desc="SAML / Google Workspace"><Btn variant="ghost" size="sm">Configure</Btn></Setting><Setting title="Active sessions" desc="3 devices"><Btn variant="ghost" size="sm">Manage</Btn></Setting><Setting title="Change password"><Btn variant="ghost" size="sm">Update</Btn></Setting></Card>}
    </>
  );
}

function PageBilling() {
  return (
    <>
      <PageHead title="Billing" desc="Plan, usage and invoices." actions={<Btn variant="ghost" icon="download">Download all</Btn>} />
      <div className="grid gap-5 lg:grid-cols-3 mb-6">
        <Card className="p-5 lg:col-span-2" style={{ background: "linear-gradient(120deg, var(--accent-soft), var(--panel))" }}>
          <div className="flex items-start justify-between"><div><Badge tone="warn">Current plan</Badge><p className="text-[26px] font-extrabold mt-2" style={{ color: "var(--text)" }}>Growth</p><p className="text-[13.5px]" style={{ color: "var(--muted)" }}>₹18,400 / month · renews Jul 1, 2026</p></div><Btn variant="primary" icon="arrowUpRight">Upgrade</Btn></div>
          <div className="grid sm:grid-cols-3 gap-4 mt-6">{[["Call minutes", 64, "6,420 / 10,000"], ["Agents", 50, "3 / 6"], ["Dograh credits", 62, "18,240 left"]].map((u) => <div key={u[0]}><div className="flex justify-between text-[12.5px] mb-1.5"><span style={{ color: "var(--muted)" }}>{u[0]}</span><span className="font-bold" style={{ color: "var(--text)" }}>{u[2]}</span></div><div className="h-2 rounded-full" style={{ background: "rgba(0,0,0,.08)" }}><div className="h-full rounded-full" style={{ width: u[1] + "%", background: "var(--accent)" }} /></div></div>)}</div>
        </Card>
        <Card className="p-5"><h3 className="font-bold text-[14px] mb-3" style={{ color: "var(--text)" }}>Payment method</h3><div className="flex items-center gap-3 p-3 rounded-xl mb-3" style={{ border: "1px solid var(--line)" }}><span className="ui-iconbox" style={{ width: 40, height: 40, borderRadius: 10 }}><Icon name="card" size={18} /></span><div className="leading-tight"><p className="font-bold text-[13.5px]" style={{ color: "var(--text)" }}>•••• 4821</p><p className="text-[12px]" style={{ color: "var(--muted)" }}>Expires 09/28</p></div></div><Btn variant="ghost" size="sm" className="w-full" icon="edit">Update card</Btn></Card>
      </div>
      <Card className="overflow-hidden"><div className="p-5"><h3 className="font-extrabold text-[15px]" style={{ color: "var(--text)" }}>Invoices</h3></div><table className="ui-table"><thead><tr><th>Invoice</th><th>Plan</th><th>Date</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
        {INVOICES.map((v) => <tr key={v.id}><td className="font-bold" style={{ color: "var(--text)" }}>{v.id}</td><td>{v.plan}</td><td>{v.date}</td><td className="font-bold" style={{ color: "var(--text)" }}>{v.amount}</td><td><Badge tone="ok">{v.status}</Badge></td><td className="text-right"><Btn variant="subtle" size="sm" icon="download" /></td></tr>)}
      </tbody></table></Card>
    </>
  );
}
Object.assign(window, { PageKnowledge, PageVoice, PageTelephony, PageDograh, PageBioPage, PageSettings, PageBilling });
