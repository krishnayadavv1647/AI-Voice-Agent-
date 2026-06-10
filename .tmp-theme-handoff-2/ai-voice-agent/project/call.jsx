// call.jsx — voice call experience: connecting, live (timer + waveform + transcript), ended

const CALL_SCRIPT = [
  { who: "bot", text: "Hi! Thanks for calling Coaching Center. How can I help with your admission today?" },
  { who: "you", text: "I wanted to know about the JEE batch and the fees." },
  { who: "bot", text: "Of course. Our 2026 JEE batch runs small cohorts with weekly tests and daily doubt sessions." },
  { who: "bot", text: "Fees are around \u20b91,20,000 a year \u2014 and you could qualify for up to 90% scholarship." },
  { who: "you", text: "That sounds great. Can I book a counselling session?" },
  { who: "bot", text: "Absolutely \u2014 let me find the next available slot for you right now." },
];

function fmt(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return m + ":" + ss;
}

function Call({ t, onBack, onChat, onBook }) {
  const [status, setStatus] = React.useState("connecting"); // connecting | live | ended
  const [seconds, setSeconds] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const [idx, setIdx] = React.useState(0); // transcript progress
  const endedAtRef = React.useRef(0);
  const logRef = React.useRef(null);

  // connect -> live
  React.useEffect(() => {
    const id = setTimeout(() => { setStatus("live"); triggerRobotReaction(); }, 2200);
    return () => clearTimeout(id);
  }, []);

  // timer
  React.useEffect(() => {
    if (status !== "live") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  // transcript reveal
  React.useEffect(() => {
    if (status !== "live") return;
    if (idx >= CALL_SCRIPT.length) return;
    const id = setTimeout(() => { setIdx((i) => i + 1); triggerRobotReaction(); }, idx === 0 ? 600 : 3200);
    return () => clearTimeout(id);
  }, [status, idx]);

  React.useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [idx]);

  function end() { endedAtRef.current = seconds; setStatus("ended"); }

  const speaking = status === "live" && idx > 0 && CALL_SCRIPT[idx - 1]?.who === "bot";
  const lines = CALL_SCRIPT.slice(0, idx);

  return (
    <div className="view-enter w-full px-4 sm:px-5 py-5 sm:py-7 grid place-items-center">
      <div className="glass w-full flex flex-col items-center text-center overflow-hidden" style={{ maxWidth: 560, borderRadius: 28, padding: "clamp(26px,4vw,40px)", minHeight: "min(720px, calc(100vh - 104px))" }}>

        {status !== "ended" && (
          <>
            <div className="flex items-center gap-2 text-[12.5px] font-bold" style={{ color: "var(--muted)", letterSpacing: ".08em" }}>
              <GreenDot /> {status === "connecting" ? "CONNECTING\u2026" : "LIVE VOICE CALL"}
            </div>

            <div className="relative grid place-items-center my-6" style={{ width: 260, height: 260 }}>
              {status === "connecting" && (<><span className="pulse-ring" /><span className="pulse-ring d2" /><span className="pulse-ring d3" /></>)}
              <Robot size={status === "connecting" ? 200 : 210} glow float={status !== "connecting"} />
            </div>

            <h1 className="font-extrabold tracking-tight" style={{ fontSize: 24 }}>{t.heroTitle}</h1>

            {status === "connecting" ? (
              <p className="mt-2 text-[15px]" style={{ color: "var(--muted)" }}>Securing a private line…</p>
            ) : (
              <>
                <div className="mt-2 inline-flex items-center gap-2 text-[15px] font-semibold" style={{ color: "var(--muted)" }}>
                  <span className="font-mono tabular-nums" style={{ color: "var(--text)" }}>{fmt(seconds)}</span>
                  {muted && <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent-text)", borderRadius: 99, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>Muted</span>}
                </div>

                <div className={"eq mt-5 " + (muted ? "opacity-30" : "")}>
                  {Array.from({ length: 9 }).map((_, i) => <span key={i} style={{ animationPlayState: muted ? "paused" : "running", animationDuration: speaking ? "0.7s" : "1.5s" }} />)}
                </div>

                <div ref={logRef} className="scroll-y w-full mt-5 text-left flex flex-col gap-2.5" style={{ maxHeight: 168 }}>
                  {lines.map((l, i) => (
                    <div key={i} className="msg-in text-[14px] leading-snug">
                      <span className="font-bold" style={{ color: l.who === "bot" ? "var(--accent-text)" : "var(--text)" }}>{l.who === "bot" ? t.heroTitle.split(" ")[0] : "You"}: </span>
                      <span style={{ color: "var(--muted)" }}>{l.text}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="mt-auto pt-7 flex items-center justify-center gap-3.5">
              {status === "live" && (
                <button className="btn btn-ghost" style={{ width: 58, height: 58, borderRadius: "50%", padding: 0 }} onClick={() => setMuted((m) => !m)} aria-label="Mute">
                  <Icon name={muted ? "micOff" : "mic"} size={22} />
                </button>
              )}
              <button className="btn" style={{ width: 64, height: 64, borderRadius: "50%", padding: 0, background: "linear-gradient(180deg,#ef4444,#dc2626)", color: "#fff", boxShadow: "0 12px 26px rgba(220,38,38,.32)" }} onClick={status === "connecting" ? onBack : end} aria-label="End call">
                <Icon name="phoneOff" size={24} />
              </button>
              {status === "live" && (
                <button className="btn btn-ghost" style={{ width: 58, height: 58, borderRadius: "50%", padding: 0 }} onClick={onBook} aria-label="Book">
                  <Icon name="calendar" size={22} />
                </button>
              )}
            </div>
          </>
        )}

        {status === "ended" && (
          <div className="view-enter flex flex-col items-center w-full my-auto">
            <span className="grid place-items-center" style={{ width: 76, height: 76, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent-text)" }}>
              <Icon name="check" size={36} stroke={2.6} />
            </span>
            <h1 className="mt-5 font-extrabold tracking-tight" style={{ fontSize: 26 }}>Call ended</h1>
            <p className="mt-1.5 text-[15px]" style={{ color: "var(--muted)" }}>Duration {fmt(endedAtRef.current)} \u00b7 with {t.heroTitle}</p>

            <div className="card-solid w-full text-left mt-6" style={{ borderRadius: 18, padding: "16px 18px" }}>
              <div className="text-[12.5px] font-bold mb-2" style={{ color: "var(--muted)" }}>CALL SUMMARY</div>
              <div className="flex flex-wrap gap-2">
                {["JEE Batch", "Fees \u20b91.2L/yr", "Up to 90% scholarship", "Counselling requested"].map((s) => (
                  <span key={s} className="inline-flex items-center" style={{ background: "var(--accent-soft)", color: "var(--accent-text)", borderRadius: 99, padding: "5px 12px", fontSize: 12.5, fontWeight: 700 }}>{s}</span>
                ))}
              </div>
            </div>

            <div className="w-full flex flex-col gap-3 mt-6">
              <button className="btn btn-primary w-full" style={{ padding: "15px" }} onClick={onBook}><Icon name="calendar" size={18} /> Book a counselling session</button>
              <div className="flex gap-3">
                <button className="btn btn-ghost flex-1" style={{ padding: "13px" }} onClick={onChat}><Icon name="message" size={17} /> Continue in chat</button>
                <button className="btn btn-ghost flex-1" style={{ padding: "13px" }} onClick={onBack}><Icon name="arrowLeft" size={17} /> Home</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Call });
