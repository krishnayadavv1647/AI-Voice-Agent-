// chat.jsx — conversational chat experience with mock assistant replies

function getReply(text) {
  const q = (text || "").toLowerCase();
  if (/admiss|apply|enrol|enroll|join|seat/.test(q))
    return "Admissions for the 2026 batch are open. The process is simple: (1) share your details, (2) attend a free counselling session, (3) take the scholarship-cum-admission test, and (4) confirm your seat. Would you like me to book a counselling slot?";
  if (/course|batch|class|subject|jee|neet|foundation/.test(q))
    return "We run focused batches for JEE, NEET and Foundation (classes 8\u201310) \u2014 small cohorts, weekly tests and daily doubt-clearing. Which exam are you preparing for?";
  if (/fee|cost|price|payment|emi|charge/.test(q))
    return "Fees vary by program. Most courses range \u20b978,000\u2013\u20b91,45,000 per year, with EMI and one-time options. Scholarships can reduce this by up to 90%. Want the exact fee for a specific course?";
  if (/scholarship|financial|aid|discount|waiver/.test(q))
    return "Our SCALE scholarship test can earn up to 90% off tuition based on your score and academics, plus merit and need-based waivers. Shall I check your eligibility?";
  if (/appoint|book|visit|meet|counsel|callback|call back/.test(q))
    return "Happy to help \u2014 I can book a counselling appointment with an advisor. Tap \u201cBook\u201d below, or tell me a day and time that suits you.";
  if (/location|where|address|reach|city/.test(q))
    return "We're based in Kota, Rajasthan \u2014 the heart of India's coaching ecosystem. We also run online live batches if relocating isn't an option.";
  if (/^(hi|hello|hey|namaste|hii)\b/.test(q))
    return "Hello! I'm the Coaching Center AI assistant. I can help with admissions, courses, fees and scholarships. What would you like to know?";
  return "Great question! I can help with admissions, course details, fees and scholarships \u2014 and I can book a counselling appointment for you. Could you tell me a bit more about what you're looking for?";
}

let MID = 0;
const mid = () => ++MID;

function Bubble({ m }) {
  const isUser = m.role === "user";
  return (
    <div className={"msg-in flex items-end gap-2.5 " + (isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <span style={{ flex: "none", width: 34, height: 34 }} className="grid place-items-center">
          <Robot size={34} head glow={false} float={false} />
        </span>
      )}
      <div
        className={isUser ? "" : "card-solid"}
        style={{
          maxWidth: "78%", padding: "12px 16px", borderRadius: 18, fontSize: 15, lineHeight: 1.5,
          ...(isUser
            ? { background: "var(--accent)", color: "var(--on-accent)", borderBottomRightRadius: 6 }
            : { borderBottomLeftRadius: 6, color: "var(--text)" }),
        }}
      >
        {m.text}
      </div>
    </div>
  );
}

function Chat({ t, seedPrompt, onCall, onBook, onBack }) {
  const [messages, setMessages] = React.useState([
    { id: mid(), role: "bot", text: t.welcome || "Hi! I'm here to help with admissions, courses, fees and scholarships at " + t.businessName + ". Ask me anything." },
  ]);
  const [input, setInput] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const scrollRef = React.useRef(null);
  const seededRef = React.useRef(false);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  function send(text) {
    const val = (text != null ? text : input).trim();
    if (!val || typing) return;
    setInput("");
    setMessages((c) => [...c, { id: mid(), role: "user", text: val }]);
    setTyping(true);
    triggerRobotReaction();
    const delay = 850 + Math.min(1400, val.length * 22);
    setTimeout(() => {
      setMessages((c) => [...c, { id: mid(), role: "bot", text: getReply(val) }]);
      setTyping(false);
      triggerRobotReaction();
    }, delay);
  }

  React.useEffect(() => {
    if (seedPrompt && !seededRef.current) {
      seededRef.current = true;
      setTimeout(() => send(seedPrompt), 350);
    }
    // eslint-disable-next-line
  }, [seedPrompt]);

  const showChips = messages.length <= 1 && !typing;

  return (
    <div className="view-enter w-full px-4 sm:px-5 py-5 sm:py-7 grid place-items-center">
      <div className="glass w-full flex flex-col overflow-hidden" style={{ maxWidth: 820, borderRadius: 26, height: "min(820px, calc(100vh - 104px))" }}>
        {/* header */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5" style={{ borderBottom: "1px solid var(--line)", background: "var(--panel-2)" }}>
          <button className="btn btn-ghost" style={{ padding: 9, borderRadius: 12 }} onClick={onBack} aria-label="Back">
            <Icon name="arrowLeft" size={18} />
          </button>
          <span style={{ width: 42, height: 42, flex: "none" }} className="grid place-items-center">
            <Robot size={42} head glow={false} float={false} />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="font-extrabold text-[15px] truncate">{t.heroTitle}</div>
            <div className="text-[12.5px] inline-flex items-center gap-1.5" style={{ color: typing ? "var(--accent)" : "var(--muted)" }}>
              {typing ? "typing\u2026" : <><GreenDot /> Online</>}
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <button className="btn btn-soft" style={{ padding: "9px 13px", borderRadius: 12 }} onClick={onCall} title="Switch to voice call">
              <Icon name="headphones" size={17} /> <span className="hidden sm:inline">Call</span>
            </button>
            <button className="btn btn-ghost" style={{ padding: "9px 13px", borderRadius: 12 }} onClick={onBook} title="Book appointment">
              <Icon name="calendar" size={17} /> <span className="hidden sm:inline">Book</span>
            </button>
          </div>
        </div>

        {/* messages */}
        <div ref={scrollRef} className="scroll-y flex-1 flex flex-col gap-3.5 px-4 sm:px-6 py-5" style={{ background: "linear-gradient(var(--subtle),transparent 40%)" }}>
          {messages.map((m) => <Bubble key={m.id} m={m} />)}
          {typing && (
            <div className="msg-in flex items-end gap-2.5">
              <span style={{ flex: "none", width: 34, height: 34 }} className="grid place-items-center"><Robot size={34} head glow={false} float={false} /></span>
              <div className="card-solid typing flex items-center gap-1.5" style={{ padding: "14px 16px", borderRadius: 18, borderBottomLeftRadius: 6 }}>
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
          {showChips && (
            <div className="mt-1">
              <div className="text-[12.5px] font-bold mb-2.5" style={{ color: "var(--muted)" }}>SUGGESTED</div>
              <div className="flex flex-wrap gap-2.5">
                {CATEGORIES.map((c) => (
                  <button key={c.id} onClick={() => send(c.prompt)} className="card-solid tile-hover slot inline-flex items-center gap-2" style={{ padding: "10px 14px", borderRadius: 14, fontSize: 14, fontWeight: 600 }}>
                    <span style={{ color: "var(--accent)" }}><Icon name={c.icon} size={16} /></span>{c.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* input */}
        <form className="flex items-center gap-2.5 px-3.5 sm:px-5 py-3.5" style={{ borderTop: "1px solid var(--line)", background: "var(--panel-2)" }} onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about admissions, courses, fees…"
            className="flex-1 slot"
            style={{ background: "var(--subtle)", border: "1px solid var(--line)", borderRadius: 14, padding: "13px 16px", fontSize: 15, color: "var(--text)", outline: "none", fontFamily: "var(--font)" }}
          />
          <button type="submit" className="btn btn-primary" disabled={!input.trim() || typing} style={{ padding: "13px 16px", borderRadius: 14 }} aria-label="Send">
            <Icon name="send" size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

Object.assign(window, { Chat });
