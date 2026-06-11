// landing.jsx — public agent landing page, two layout variations (A: profile, B: editorial)

const CATEGORIES = [
  { id: "admissions", icon: "landmark", title: "Admissions", desc: "Understand the step-by-step admission process", prompt: "Walk me through the admission process." },
  { id: "courses", icon: "book", title: "Courses", desc: "Explore courses and batches", prompt: "What courses and batches do you offer?" },
  { id: "fees", icon: "receipt", title: "Fees", desc: "Get details about fees and payments", prompt: "Can you share the fee structure and payment options?" },
  { id: "scholarships", icon: "cap", title: "Scholarships", desc: "Find scholarships and financial aid", prompt: "What scholarships and financial aid are available?" },
];

const ROBOT_PX = { small: 188, medium: 248, large: 320 };

function GreenDot() {
  return (
    <span style={{ position: "relative", width: 11, height: 11, display: "inline-grid" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e", opacity: .35, animation: "pulseRing 2s ease-out infinite" }} />
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px rgba(34,197,94,.6)" }} />
    </span>
  );
}

function InfoRow({ icon, label, value, dot, first }) {
  return (
    <div className="flex items-center gap-3.5 py-3.5" style={{ borderTop: first ? "none" : "1px solid var(--line)" }}>
      <span className="icon-orb" style={{ width: 38, height: 38, borderRadius: 12 }}>
        {dot ? <GreenDot /> : <Icon name={icon} size={18} />}
      </span>
      <span className="text-[15px] font-medium" style={{ color: "var(--muted)" }}>{label}</span>
      <span className="ml-auto text-[15px] font-bold text-right">{value}</span>
    </div>
  );
}

function CategoryTile({ cat, onClick }) {
  return (
    <button onClick={() => onClick(cat)} className="card-solid tile-hover slot text-left p-5 flex flex-col" style={{ borderRadius: 22, minHeight: 178 }}>
      <span className="icon-orb" style={{ width: 54, height: 54, borderRadius: "50%", marginBottom: 16 }}>
        <Icon name={cat.icon} size={24} stroke={2.1} />
      </span>
      <span className="font-extrabold text-[17px] tracking-tight">{cat.title}</span>
      <span className="text-[13.5px] mt-1.5 leading-snug" style={{ color: "var(--muted)" }}>{cat.desc}</span>
      <span className="mt-auto pt-4 inline-flex"><Icon name="arrowRight" size={18} style={{ color: "var(--accent)" }} /></span>
    </button>
  );
}

function StatChip({ icon, label, value }) {
  return (
    <div className="glass flex items-center gap-2.5 px-3.5 py-2.5" style={{ borderRadius: 14, flex: "none" }}>
      <span style={{ color: "var(--accent)" }}><Icon name={icon} size={18} /></span>
      <div className="leading-tight" style={{ whiteSpace: "nowrap" }}>
        <div className="text-[13px] font-bold">{value}</div>
        <div className="text-[11px]" style={{ color: "var(--muted)" }}>{label}</div>
      </div>
    </div>
  );
}

function CTAButtons({ t, onStart, onBook, onCall, full }) {
  return (
    <div className={"flex flex-col gap-3 " + (full ? "w-full" : "")}>
      <button className="btn btn-primary w-full" style={{ padding: "16px 22px" }} onClick={onStart}>
        <Icon name="message" size={19} /> {t.ctaLabel} <Icon name="arrowRight" size={18} style={{ marginLeft: "auto" }} />
      </button>
      <div className="flex gap-3">
        <button className="btn btn-ghost flex-1" style={{ padding: "14px 18px" }} onClick={onBook}>
          <Icon name="calendar" size={18} /> Book Appointment
        </button>
        <button className="btn btn-soft" style={{ padding: "14px 18px" }} onClick={onCall} title="Start a voice call">
          <Icon name="headphones" size={18} /> Voice Call
        </button>
      </div>
    </div>
  );
}

function AiPill() {
  return (
    <span className="ai-pill"><span className="spk"><Icon name="sparkle" size={15} /></span> AI Assistant</span>
  );
}

function Landing({ t, onStart, onBook, onCall, onTile }) {
  const size = ROBOT_PX[t.robotSize] || ROBOT_PX.medium;

  const tiles = t.showTiles && (
    <div className="mt-7">
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-[15px] font-extrabold tracking-tight" style={{ color: "var(--muted)" }}>QUICK TOPICS</h2>
        <span className="text-[13px] font-semibold inline-flex items-center gap-1" style={{ color: "var(--accent)" }}>Tap to ask <Icon name="arrowRight" size={15} /></span>
      </div>
      <div className="grid gap-3.5 stagger" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {CATEGORIES.map((c) => <CategoryTile key={c.id} cat={c} onClick={onTile} />)}
      </div>
    </div>
  );

  if (t.layout === "B") {
    // ---- Editorial layout ----
    return (
      <div className="view-enter mx-auto w-full px-5 py-8 sm:py-12" style={{ maxWidth: 1180 }}>
        <div className="glass relative overflow-hidden" style={{ borderRadius: 32, padding: "clamp(24px,4vw,52px)" }}>
          <div style={{ position: "absolute", top: -120, right: -80, width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, var(--accent-tint), transparent 65%)", pointerEvents: "none" }} />
          <div className="grid items-center gap-8 lg:gap-6" style={{ gridTemplateColumns: "minmax(0,1.05fr) minmax(0,.95fr)" }}>
            <div className="min-w-0 order-2 lg:order-1">
              <AiPill />
              <h1 className="mt-5 font-black tracking-tight" style={{ fontSize: "clamp(40px,5.6vw,68px)", lineHeight: 1.02, letterSpacing: "-0.02em" }}>
                {t.heroTitle}
              </h1>
              <p className="mt-5 text-[17px] sm:text-[18px] leading-relaxed" style={{ color: "var(--muted)", maxWidth: 480 }}>{t.heroSubtitle}</p>
              <div className="flex flex-wrap gap-2.5 mt-6 mb-7">
                <StatChip icon="mapPin" label="Location" value="Kota, Rajasthan" />
                <StatChip icon="clock" label="Avg. response" value="< 30 sec" />
                <StatChip icon="globe" label="Availability" value="Online now" />
              </div>
              <CTAButtons t={t} onStart={onStart} onBook={onBook} onCall={onCall} />
            </div>
            <div className="order-1 lg:order-2 grid place-items-center">
              <Robot size={Math.round(size * 1.18)} ring glow float />
            </div>
          </div>
        </div>
        {tiles}
      </div>
    );
  }

  // ---- Profile layout (A) ----
  return (
    <div className="view-enter mx-auto w-full px-5 py-8 sm:py-12" style={{ maxWidth: 1060 }}>
      <div className="grid gap-7 lg:gap-10 lg:items-center" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
        <div className="grid gap-8 lg:gap-10" style={{ gridTemplateColumns: "1fr" }}>
          <div className="lg:grid lg:gap-10 lg:items-center" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(320px,.92fr)" }}>
            {/* hero */}
            <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
              <AiPill />
              <div className="my-2"><Robot size={size} glow float /></div>
              <h1 className="font-black tracking-tight" style={{ fontSize: "clamp(38px,6vw,60px)", lineHeight: 1.03, letterSpacing: "-0.02em" }}>{t.heroTitle}</h1>
              <p className="mt-4 text-[16px] sm:text-[17px] leading-relaxed" style={{ color: "var(--muted)", maxWidth: 460 }}>{t.heroSubtitle}</p>
            </div>
            {/* info + cta */}
            <div className="mt-8 lg:mt-0 flex flex-col gap-5">
              <div className="glass" style={{ borderRadius: 22, padding: "8px 20px" }}>
                <InfoRow icon="landmark" label="Business" value={t.businessName} first />
                <InfoRow icon="book" label="Category" value="Education" />
                <InfoRow icon="mapPin" label="Location" value="Kota, Rajasthan" />
                <InfoRow dot label="Availability" value="Online now" />
                <InfoRow icon="zap" label="Response Time" value="< 30 sec" />
              </div>
              <CTAButtons t={t} onStart={onStart} onBook={onBook} onCall={onCall} full />
            </div>
          </div>
        </div>
      </div>
      {tiles}
    </div>
  );
}

Object.assign(window, { Landing, CATEGORIES, AiPill, GreenDot });
