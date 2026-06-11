// app/pages_comms.jsx — Messages, Email Outreach, Email Inbox
const SAMPLE_CHAT = {
  m1: [{ r: "them", t: "Hi, is the JEE batch still open for July?" }, { r: "you", t: "Yes! We have 12 seats left in the morning batch. Want me to book a counselling call?" }, { r: "them", t: "Sounds perfect, I'll join the 11:30 call 🙏" }],
  m3: [{ r: "them", t: "What's the last date to apply?" }, { r: "them", t: "And is the scholarship test online?" }],
  m5: [{ r: "them", t: "Can you send 2BHK options under 35k?" }],
};

function PageMessages() {
  const [sel, setSel] = React.useState("m1");
  const [val, setVal] = React.useState("");
  const t = THREADS.find((x) => x.id === sel);
  const chat = SAMPLE_CHAT[sel] || [{ r: "you", t: "Conversation history will appear here." }];
  return (
    <>
      <PageHead title="Messages" desc="WhatsApp & SMS conversations handled by your agents." />
      <Card className="overflow-hidden grid lg:grid-cols-[320px_1fr]" style={{ height: "min(680px, calc(100vh - 230px))" }}>
        <div className={cx("ui-scroll flex-col", "lg:flex", sel ? "hidden lg:flex" : "flex")} style={{ borderRight: "1px solid var(--line)", overflowY: "auto" }}>
          <div className="p-3" style={{ borderBottom: "1px solid var(--line)" }}><div className="flex items-center gap-2 px-3 rounded-xl" style={{ background: "#fff", border: "1px solid var(--line)", height: 40 }}><Icon name="search" size={16} style={{ color: "var(--muted)" }} /><input placeholder="Search chats" className="flex-1 bg-transparent outline-none text-[13.5px]" /></div></div>
          {THREADS.map((th) => (
            <button key={th.id} onClick={() => setSel(th.id)} className="flex items-center gap-3 p-3 text-left transition" style={{ borderBottom: "1px solid var(--line-soft)", background: sel === th.id ? "var(--accent-softer)" : "transparent" }}>
              <Avatar name={th.name} size={42} />
              <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="font-bold text-[14px] truncate" style={{ color: "var(--text)" }}>{th.name}</p><span className="text-[11px]" style={{ color: "var(--muted)" }}>{th.time}</span></div><div className="flex items-center gap-1.5"><Icon name={th.channel === "SMS" ? "message" : "message"} size={11} style={{ color: th.channel === "WhatsApp" ? "#4f8a5b" : "var(--muted)" }} /><p className="text-[12.5px] truncate" style={{ color: "var(--muted)" }}>{th.last}</p></div></div>
              {th.unread > 0 && <span className="grid place-items-center text-[11px] font-bold text-white shrink-0" style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent)" }}>{th.unread}</span>}
            </button>
          ))}
        </div>
        <div className={cx("flex-col", sel ? "flex" : "hidden lg:flex")}>
          <div className="flex items-center gap-3 p-3.5" style={{ borderBottom: "1px solid var(--line)" }}>
            <button className="lg:hidden" onClick={() => setSel(null)}><Icon name="arrowLeft" size={20} /></button>
            <Avatar name={t.name} size={40} /><div className="leading-tight flex-1"><p className="font-bold text-[14.5px]" style={{ color: "var(--text)" }}>{t.name}</p><p className="text-[12px]" style={{ color: "var(--muted)" }}>{t.channel} · online</p></div>
            <Btn variant="ghost" size="sm" icon="phone" /><Btn variant="ghost" size="sm" icon="moreV" />
          </div>
          <div className="flex-1 ui-scroll p-4 flex flex-col gap-2.5" style={{ overflowY: "auto", background: "var(--accent-softer)" }}>
            {chat.map((m, i) => <div key={i} className={cx("flex", m.r === "you" ? "justify-end" : "justify-start")}><div style={{ maxWidth: "76%", padding: "9px 13px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.45, ...(m.r === "you" ? { background: "var(--accent)", color: "#fff", borderBottomRightRadius: 4 } : { background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)", borderBottomLeftRadius: 4 }) }}>{m.t}</div></div>)}
          </div>
          <form className="flex gap-2 p-3" style={{ borderTop: "1px solid var(--line)" }} onSubmit={(e) => { e.preventDefault(); setVal(""); }}><input className="ui-input" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Type a reply…" /><Btn variant="primary" icon="send" type="submit" /></form>
        </div>
      </Card>
    </>
  );
}

function Rate({ label, pct, color }) {
  return <div className="min-w-[120px]"><div className="flex justify-between text-[12px] mb-1"><span style={{ color: "var(--muted)" }}>{label}</span><span className="font-bold" style={{ color: "var(--text)" }}>{pct}%</span></div><div className="h-1.5 rounded-full" style={{ background: "#e3d6bd" }}><div className="h-full rounded-full" style={{ width: pct + "%", background: color }} /></div></div>;
}

function PageOutreach() {
  return (
    <>
      <PageHead title="Email Outreach" desc="Multi-step email campaigns that nurture leads into bookings."
        actions={<><Btn variant="ghost" icon="template">Templates</Btn><Btn variant="primary" icon="plus">New campaign</Btn></>} />
      <StatStrip items={[
        { label: "Emails sent (30d)", value: "8,420", icon: "mail", trend: "+12%" },
        { label: "Open rate", value: "61%", icon: "eye", trend: "+4%" },
        { label: "Reply rate", value: "18%", icon: "message", trend: "+2%" },
        { label: "Meetings booked", value: "94", icon: "calendar", trend: "+21%" },
      ]} />
      <div className="grid gap-3">{OUTREACH.map((o) => {
        const openPct = o.recipients ? Math.round(o.opened / o.recipients * 100) : 0;
        const replyPct = o.recipients ? Math.round(o.replied / o.recipients * 100) : 0;
        return (
          <Card key={o.id} className="p-5 flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2.5 mb-1"><p className="font-bold text-[15px] truncate" style={{ color: "var(--text)" }}>{o.subject}</p><Badge tone={o.status === "Completed" ? "ok" : o.status === "Sending" ? "info" : "warn"}>{o.status}</Badge></div><p className="text-[13px]" style={{ color: "var(--muted)" }}>{o.segment} · {o.recipients} recipients · {o.date}</p></div>
            <div className="flex gap-5"><Rate label="Opened" pct={openPct} color="var(--accent)" /><Rate label="Replied" pct={replyPct} color="#5b7c5a" /></div>
            <Btn variant="ghost" size="sm" icon="chevronRight" />
          </Card>
        );
      })}</div>
    </>
  );
}

function PageInbox() {
  const [sel, setSel] = React.useState(INBOX[0].id);
  const e = INBOX.find((x) => x.id === sel);
  return (
    <>
      <PageHead title="Email Inbox" desc="Replies from leads and partners, unified in one place." />
      <Card className="overflow-hidden grid lg:grid-cols-[360px_1fr]" style={{ height: "min(680px, calc(100vh - 230px))" }}>
        <div className={cx("ui-scroll flex-col lg:flex", sel ? "hidden lg:flex" : "flex")} style={{ borderRight: "1px solid var(--line)", overflowY: "auto" }}>
          <div className="p-3 flex gap-1" style={{ borderBottom: "1px solid var(--line)" }}>{["All", "Unread", "Leads"].map((t, i) => <button key={t} className={cx("ui-tab text-[12.5px]", i === 0 && "ui-tab-on")}>{t}</button>)}</div>
          {INBOX.map((m) => (
            <button key={m.id} onClick={() => setSel(m.id)} className="flex gap-3 p-3.5 text-left" style={{ borderBottom: "1px solid var(--line-soft)", background: sel === m.id ? "var(--accent-softer)" : "transparent" }}>
              {m.unread && <span className="mt-1.5 shrink-0" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />}
              <div className={cx("min-w-0 flex-1", !m.unread && "pl-[20px]")}><div className="flex justify-between gap-2"><p className={cx("text-[14px] truncate", m.unread ? "font-extrabold" : "font-semibold")} style={{ color: "var(--text)" }}>{m.from}</p><span className="text-[11px] shrink-0" style={{ color: "var(--muted)" }}>{m.time}</span></div><p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-2)" }}>{m.subject}</p><p className="text-[12.5px] truncate" style={{ color: "var(--muted)" }}>{m.preview}</p></div>
            </button>
          ))}
        </div>
        <div className={cx("flex-col", sel ? "flex" : "hidden lg:flex")} style={{ overflow: "hidden" }}>
          <div className="flex items-center gap-3 p-4" style={{ borderBottom: "1px solid var(--line)" }}>
            <button className="lg:hidden" onClick={() => setSel(null)}><Icon name="arrowLeft" size={20} /></button>
            <div className="flex-1 min-w-0"><p className="font-extrabold text-[16px] truncate" style={{ color: "var(--text)" }}>{e.subject}</p></div>
            <Badge tone="info">{e.label}</Badge><Btn variant="ghost" size="sm" icon="trash" />
          </div>
          <div className="flex-1 ui-scroll p-5" style={{ overflowY: "auto" }}>
            <div className="flex items-center gap-3 mb-5"><Avatar name={e.from} size={44} /><div className="leading-tight"><p className="font-bold text-[14.5px]" style={{ color: "var(--text)" }}>{e.from}</p><p className="text-[12.5px]" style={{ color: "var(--muted)" }}>{e.email}</p></div></div>
            <p className="text-[14.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>{e.preview}</p>
            <p className="text-[14.5px] leading-relaxed mt-4" style={{ color: "var(--text-2)" }}>Looking forward to your reply. Thanks!</p>
            <div className="mt-6 flex gap-2"><Btn variant="primary" icon="send">Reply</Btn><Btn variant="ghost" icon="arrowRight">Forward</Btn></div>
          </div>
        </div>
      </Card>
    </>
  );
}
Object.assign(window, { PageMessages, PageOutreach, PageInbox });
