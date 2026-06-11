// app.jsx — theme orchestration, view router, top bar, tweaks

const ACCENTS = [
  { key: "Blue", color: "#2b53ec", d: "#2340c0" },
  { key: "Violet", color: "#7c3aed", d: "#6a26d9" },
  { key: "Orange", color: "#e8722b", d: "#c8551a" },
  { key: "Green", color: "#16a34a", d: "#137a39" },
  { key: "Teal", color: "#0d9488", d: "#0b7068" },
];
const ACCENT_COLORS = ACCENTS.map((a) => a.color);
const darkFor = (hex) => (ACCENTS.find((a) => a.color.toLowerCase() === String(hex).toLowerCase()) || ACCENTS[0]).d;

const FONTS = {
  Inter: "'Inter', ui-sans-serif, system-ui, sans-serif",
  Poppins: "'Poppins', ui-sans-serif, system-ui, sans-serif",
  Manrope: "'Manrope', ui-sans-serif, system-ui, sans-serif",
  System: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "A",
  "accent": "#2b53ec",
  "palette": "cool",
  "robotSize": "medium",
  "font": "Inter",
  "showTiles": true,
  "heroTitle": "Coaching Center AI",
  "heroSubtitle": "Your intelligent admissions advisor \u2014 guiding students through courses, admissions, scholarships and career decisions.",
  "businessName": "Coaching Center",
  "ctaLabel": "Start Conversation",
  "welcome": "Hi! I'm your admissions advisor. Ask me about courses, fees or scholarships \u2014 or book a free counselling session."
}/*EDITMODE-END*/;

function TopBar({ t, view, onHome }) {
  return (
    <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--panel-2) 82%, transparent)", borderBottom: "1px solid var(--line)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
      <div className="mx-auto flex items-center gap-3 px-4 sm:px-6" style={{ maxWidth: 1180, height: 60 }}>
        <button onClick={onHome} className="flex items-center gap-2.5 min-w-0" aria-label="Home">
          <span style={{ width: 34, height: 34, flex: "none" }} className="grid place-items-center"><Robot size={34} head glow={false} float={false} /></span>
          <span className="min-w-0 leading-tight text-left">
            <span className="block font-extrabold text-[14px] truncate">{t.heroTitle}</span>
            <span className="block text-[11.5px]" style={{ color: "var(--muted)" }}>Education · Online</span>
          </span>
        </button>
        <div className="ml-auto flex items-center gap-3">
          {view !== "landing" && (
            <button onClick={onHome} className="btn btn-ghost" style={{ padding: "8px 13px", borderRadius: 12, fontSize: 13.5 }}><Icon name="arrowLeft" size={16} /> <span className="hidden sm:inline">Home</span></button>
          )}
          <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--muted)" }}><GreenDot /> Online now</span>
        </div>
      </div>
    </header>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = React.useState("landing");
  const [seed, setSeed] = React.useState(null);

  const rootStyle = {
    "--accent": t.accent,
    "--accent-d": darkFor(t.accent),
    "--font": FONTS[t.font] || FONTS.Inter,
  };

  function goChat(prompt) { setSeed(prompt || null); setView("chat"); }
  function home() { setView("landing"); }

  const props = { t };

  return (
    <div id="app-root" data-pal={t.palette} style={rootStyle}>
      <TopBar t={t} view={view} onHome={home} />

      <div key={view}>
        {view === "landing" && (
          <Landing t={t} onStart={() => goChat(null)} onCall={() => setView("call")} onBook={() => setView("booking")} onTile={(c) => goChat(c.prompt)} />
        )}
        {view === "chat" && (
          <Chat t={t} seedPrompt={seed} onCall={() => setView("call")} onBook={() => setView("booking")} onBack={home} />
        )}
        {view === "call" && (
          <Call t={t} onBack={home} onChat={() => goChat(null)} onBook={() => setView("booking")} />
        )}
        {view === "booking" && (
          <Booking t={t} onBack={home} onChat={() => goChat(null)} />
        )}
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Layout" />
        <TweakRadio label="Landing style" value={t.layout} options={[{ value: "A", label: "Profile" }, { value: "B", label: "Editorial" }]} onChange={(v) => setTweak("layout", v)} />
        <TweakToggle label="Show category tiles" value={t.showTiles} onChange={(v) => setTweak("showTiles", v)} />

        <TweakSection label="Theme" />
        <TweakColor label="Accent" value={t.accent} options={ACCENT_COLORS} onChange={(v) => setTweak("accent", v)} />
        <TweakRadio label="Palette" value={t.palette} options={[{ value: "cool", label: "Cool" }, { value: "warm", label: "Warm" }]} onChange={(v) => setTweak("palette", v)} />
        <TweakSelect label="Font" value={t.font} options={["Inter", "Poppins", "Manrope", "System"]} onChange={(v) => setTweak("font", v)} />

        <TweakSection label="Mascot" />
        <TweakRadio label="Robot size" value={t.robotSize} options={[{ value: "small", label: "S" }, { value: "medium", label: "M" }, { value: "large", label: "L" }]} onChange={(v) => setTweak("robotSize", v)} />

        <TweakSection label="Content" />
        <TweakText label="Title" value={t.heroTitle} onChange={(v) => setTweak("heroTitle", v)} />
        <TweakText label="Business" value={t.businessName} onChange={(v) => setTweak("businessName", v)} />
        <TweakText label="CTA label" value={t.ctaLabel} onChange={(v) => setTweak("ctaLabel", v)} />
        <TweakText label="Subtitle" value={t.heroSubtitle} onChange={(v) => setTweak("heroSubtitle", v)} />

        <TweakSection label="Preview screen" />
        <div className="twk-chips" style={{ flexWrap: "wrap" }}>
          <TweakButton label="Home" secondary onClick={() => setView("landing")} />
          <TweakButton label="Chat" secondary onClick={() => goChat(null)} />
          <TweakButton label="Call" secondary onClick={() => setView("call")} />
          <TweakButton label="Booking" secondary onClick={() => setView("booking")} />
        </div>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
