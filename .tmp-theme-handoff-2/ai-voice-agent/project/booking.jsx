// booking.jsx — appointment booking flow + confirmation

const SLOTS = ["10:00 AM", "11:30 AM", "02:00 PM", "04:30 PM", "06:00 PM"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-bold mb-1.5" style={{ color: "var(--muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function Booking({ t, onBack, onChat }) {
  const days = React.useMemo(() => {
    const base = new Date(2026, 5, 9); // Jun 9, 2026
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i);
      return { dow: DOW[d.getDay()], day: d.getDate(), mon: MON[d.getMonth()], label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : DOW[d.getDay()] + ", " + MON[d.getMonth()] + " " + d.getDate() };
    });
  }, []);

  const [di, setDi] = React.useState(1);
  const [time, setTime] = React.useState("");
  const [mode, setMode] = React.useState("Online");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [done, setDone] = React.useState(false);

  const valid = time && name.trim() && phone.trim().length >= 6;
  const inputStyle = { background: "var(--subtle)", border: "1px solid var(--line)", borderRadius: 13, padding: "12px 14px", fontSize: 15, color: "var(--text)", outline: "none", width: "100%", fontFamily: "var(--font)" };

  if (done) {
    const d = days[di];
    return (
      <div className="view-enter w-full px-4 sm:px-5 py-7 grid place-items-center">
        <div className="glass w-full flex flex-col items-center text-center" style={{ maxWidth: 520, borderRadius: 28, padding: "clamp(28px,4vw,44px)" }}>
          <div className="relative grid place-items-center" style={{ width: 130, height: 130 }}>
            <Robot size={130} glow float />
          </div>
          <span className="grid place-items-center -mt-3" style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--accent)", color: "var(--on-accent)", boxShadow: "0 10px 22px var(--accent-tint)" }}>
            <Icon name="check" size={24} stroke={3} />
          </span>
          <h1 className="mt-4 font-extrabold tracking-tight" style={{ fontSize: 27 }}>You're booked!</h1>
          <p className="mt-2 text-[15px]" style={{ color: "var(--muted)" }}>A counselling advisor will meet {name.split(" ")[0]} as scheduled. We've sent a confirmation to {phone}.</p>

          <div className="card-solid w-full text-left mt-6" style={{ borderRadius: 18, padding: "6px 18px" }}>
            {[["calendar", "Date", d.label], ["clock", "Time", time], ["globe", mode === "Online" ? "Mode" : "Mode", mode + (mode === "Online" ? " (link sent)" : " \u00b7 Kota center")], ["user", "Advisor", "Senior Counsellor"]].map(([ic, l, v], i) => (
              <div key={l} className="flex items-center gap-3 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                <span className="icon-orb" style={{ width: 34, height: 34, borderRadius: 10 }}><Icon name={ic} size={16} /></span>
                <span className="text-[14px] font-medium" style={{ color: "var(--muted)" }}>{l}</span>
                <span className="ml-auto text-[14px] font-bold">{v}</span>
              </div>
            ))}
          </div>

          <div className="w-full flex flex-col gap-3 mt-6">
            <button className="btn btn-soft w-full" style={{ padding: "14px" }}><Icon name="calendar" size={18} /> Add to calendar</button>
            <div className="flex gap-3">
              <button className="btn btn-ghost flex-1" style={{ padding: "13px" }} onClick={onChat}><Icon name="message" size={17} /> Ask a question</button>
              <button className="btn btn-ghost flex-1" style={{ padding: "13px" }} onClick={onBack}><Icon name="arrowLeft" size={17} /> Home</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="view-enter w-full px-4 sm:px-5 py-5 sm:py-7 grid place-items-center">
      <div className="glass w-full" style={{ maxWidth: 620, borderRadius: 26, padding: "clamp(22px,3.5vw,34px)" }}>
        <div className="flex items-center gap-3 mb-1">
          <button className="btn btn-ghost" style={{ padding: 9, borderRadius: 12 }} onClick={onBack} aria-label="Back"><Icon name="arrowLeft" size={18} /></button>
          <div>
            <h1 className="font-extrabold tracking-tight" style={{ fontSize: 22 }}>Book a counselling session</h1>
            <p className="text-[13.5px]" style={{ color: "var(--muted)" }}>Free 1-on-1 with an advisor at {t.businessName}</p>
          </div>
        </div>

        {/* date strip */}
        <div className="mt-6">
          <div className="text-[13px] font-bold mb-2.5" style={{ color: "var(--muted)" }}>SELECT A DATE</div>
          <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {days.map((d, i) => {
              const on = i === di;
              return (
                <button key={i} onClick={() => setDi(i)} className="slot flex flex-col items-center justify-center flex-none" style={{ width: 64, height: 76, borderRadius: 16, border: "1px solid " + (on ? "transparent" : "var(--line)"), background: on ? "var(--accent)" : "var(--panel-2)", color: on ? "var(--on-accent)" : "var(--text)", boxShadow: on ? "0 10px 22px var(--accent-tint)" : "none" }}>
                  <span className="text-[11px] font-semibold" style={{ opacity: .8 }}>{i === 0 ? "TODAY" : d.dow.toUpperCase()}</span>
                  <span className="text-[20px] font-extrabold leading-none mt-1">{d.day}</span>
                  <span className="text-[10.5px] mt-0.5" style={{ opacity: .75 }}>{d.mon}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* time slots */}
        <div className="mt-5">
          <div className="text-[13px] font-bold mb-2.5" style={{ color: "var(--muted)" }}>AVAILABLE SLOTS</div>
          <div className="flex flex-wrap gap-2.5">
            {SLOTS.map((s) => {
              const on = s === time;
              return (
                <button key={s} onClick={() => setTime(s)} className="slot" style={{ padding: "10px 16px", borderRadius: 12, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", border: "1px solid " + (on ? "transparent" : "var(--line)"), background: on ? "var(--accent-soft)" : "var(--panel-2)", color: on ? "var(--accent-text)" : "var(--text)", boxShadow: on ? "inset 0 0 0 1.5px var(--accent)" : "none" }}>{s}</button>
              );
            })}
          </div>
        </div>

        {/* mode */}
        <div className="mt-5">
          <div className="text-[13px] font-bold mb-2.5" style={{ color: "var(--muted)" }}>MODE</div>
          <div className="flex gap-2.5">
            {["Online", "In-person"].map((m) => {
              const on = m === mode;
              return (
                <button key={m} onClick={() => setMode(m)} className="slot flex-1" style={{ padding: "11px", borderRadius: 12, fontSize: 14, fontWeight: 700, border: "1px solid " + (on ? "transparent" : "var(--line)"), background: on ? "var(--accent-soft)" : "var(--panel-2)", color: on ? "var(--accent-text)" : "var(--text)", boxShadow: on ? "inset 0 0 0 1.5px var(--accent)" : "none" }}>
                  <Icon name={m === "Online" ? "globe" : "mapPin"} size={16} /> {m}
                </button>
              );
            })}
          </div>
        </div>

        {/* contact */}
        <div className="grid sm:grid-cols-2 gap-4 mt-5">
          <Field label="Your name"><input className="slot" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aarav Sharma" /></Field>
          <Field label="Phone number"><input className="slot" style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" /></Field>
        </div>

        <button className="btn btn-primary w-full mt-7" style={{ padding: "16px" }} disabled={!valid} onClick={() => { setDone(true); triggerRobotReaction(); }}>
          Confirm booking <Icon name="arrowRight" size={18} style={{ marginLeft: "auto" }} />
        </button>
        {!valid && <p className="text-center text-[12.5px] mt-2.5" style={{ color: "var(--muted)" }}>Pick a slot and add your details to confirm.</p>}
      </div>
    </div>
  );
}

Object.assign(window, { Booking });
