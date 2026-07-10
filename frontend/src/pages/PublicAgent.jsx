import {
  ArrowLeft,
  ArrowRight,
  AudioWaveform,
  BadgePercent,
  Bot,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  Clock,
  DollarSign,
  Facebook,
  Globe,
  GraduationCap,
  Headphones,
  HeartPulse,
  HelpCircle,
  Home,
  Info,
  Instagram,
  Landmark,
  Linkedin,
  MapPin,
  Menu,
  MessageCircle,
  PhoneOff,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Users,
  Utensils,
  User,
  X,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import robotHead from "../assets/voiceflow-theme/robot-head.png";
import robotImage from "../assets/voiceflow-theme/robot.png";
import { API_URL, api } from "../lib/api.js";
import { startVapiWebCall } from "../utils/startVapiWebCall.js";
import { requestMicrophoneAccess } from "../utils/microphone.js";

// Business-neutral fallback topics. Only used when an agent has not configured its own
// quickTopics in the bio builder, so they must read sensibly for any business type
// (food, coaching, clinic, real estate, ...) rather than being education-specific.
const defaultQuickTopics = [
  { id: "offerings", icon: "Sparkles", iconType: "lucide", color: "#2563EB", title: "What we offer", description: "Explore our products and services", prompt: "What products and services do you offer?", isVisible: true, order: 0 },
  { id: "pricing", icon: "BadgePercent", iconType: "lucide", color: "#2563EB", title: "Pricing & offers", description: "Get prices, packages and current deals", prompt: "Can you share pricing and any current offers?", isVisible: true, order: 1 },
  { id: "hours-location", icon: "MapPin", iconType: "lucide", color: "#2563EB", title: "Hours & location", description: "Timings, address and how to reach us", prompt: "What are your opening hours and where are you located?", isVisible: true, order: 2 },
  { id: "contact", icon: "MessageCircle", iconType: "lucide", color: "#2563EB", title: "Talk to us", description: "Book, order or reach the team", prompt: "I'd like to get in touch or place a request.", isVisible: true, order: 3 }
];

const topicIconMap = {
  BadgePercent,
  BookOpen,
  Building2,
  Calendar,
  CalendarDays,
  Clock,
  DollarSign,
  GraduationCap,
  Headphones,
  HeartPulse,
  HelpCircle,
  Home,
  Landmark,
  MapPin,
  MessageCircle,
  Phone,
  Sparkles,
  Star,
  Users,
  Utensils,
  Zap
};

const slots = ["10:00 AM", "11:30 AM", "02:00 PM", "04:30 PM", "06:00 PM"];

function defaultTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Calcutta";
}

function toDateInputValue(date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function slotToTimeValue(slot) {
  const match = String(slot || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2];
  const period = match[3].toUpperCase();
  if (period === "AM" && hour === 12) hour = 0;
  if (period === "PM" && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function makeSessionId() {
  const existing = sessionStorage.getItem("public_agent_session_id");
  if (existing) return existing;

  const next = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  sessionStorage.setItem("public_agent_session_id", next);
  return next;
}

function text(value, fallback) {
  return value && String(value).trim() ? value : fallback;
}

function publicText(value, fallback) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return fallback;
  if (cleaned.length > 260 || /Lead Flow:|Human Transfer:|Fallback:|Ending:|Never guarantee|Keep replies/i.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

function assetUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_URL.replace(/\/api$/, "")}${value}`;
}

// --- Design-token helpers -------------------------------------------------
// The public page is fully theme-driven: colors, radii and fonts all come from the
// saved bioPage so selecting a template changes real structure + styling, not defaults.
const FONT_STACKS = {
  Inter: '"App Body Inter", Inter, ui-sans-serif, system-ui, sans-serif',
  Manrope: '"App Body Manrope", Manrope, "App Body Inter", ui-sans-serif, system-ui, sans-serif',
  "Rethink Sans": '"App Body Rethink Sans", "Rethink Sans", "App Body Inter", ui-sans-serif, system-ui, sans-serif',
  Roboto: '"App Heading Roboto", Roboto, "App Body Inter", ui-sans-serif, system-ui, sans-serif',
  "Stack Sans": '"App Body Stack Sans", "App Body Inter", ui-sans-serif, system-ui, sans-serif'
};
const FONT_STYLE_FALLBACK = {
  modern: { heading: "Manrope", body: "Inter" },
  professional: { heading: "Manrope", body: "Inter" },
  friendly: { heading: "Rethink Sans", body: "Inter" },
  bold: { heading: "Stack Sans", body: "Inter" },
  elegant: { heading: "Roboto", body: "Inter" }
};
const RADIUS_PX = { sm: "10px", md: "14px", lg: "18px", xl: "24px", "2xl": "30px", pill: "999px" };
const TRACKING_EM = { tight: "-0.02em", normal: "0em", wide: "0.03em" };
const BODY_PX = { sm: "14px", md: "15.5px", lg: "17px" };
const CONTENT_MAX = { narrow: "760px", standard: "1080px", wide: "1200px", full: "1320px" };

function fontStack(name) {
  return FONT_STACKS[name] || FONT_STACKS.Inter;
}

function clampHex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (clean.length !== 6) return { r: 37, g: 99, b: 235 };
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c) => {
    const next = amount < 0 ? c * (1 + amount) : c + (255 - c) * amount;
    return Math.max(0, Math.min(255, Math.round(next)));
  };
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function triggerRobotReaction() {
  document.querySelectorAll(".vf-robot-img").forEach((el) => {
    el.classList.remove("vf-robot-react");
    void el.offsetWidth;
    el.classList.add("vf-robot-react");
  });
}

export default function PublicAgent() {
  const { publicSlug } = useParams();
  const [agent, setAgent] = useState(null);
  const [view, setView] = useState("landing");
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [seedPrompt, setSeedPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [callStatus, setCallStatus] = useState("idle");
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const vapiRef = useRef(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sessionId = useMemo(makeSessionId, []);
  const seededRef = useRef("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        setAgent(await api(`/public/agents/${publicSlug}`, { auth: false }));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [publicSlug]);

  const bio = agent?.bioPage || {};
  const businessInfo = bio.businessInfo || {};
  const socialLinks = bio.socialLinks || {};
  const showAppointment = (bio.showAppointmentButton ?? bio.showAppointment) !== false;
  const showVoiceCall = (bio.showVoiceCallButton ?? bio.showWebCallButton ?? bio.showWebCall) !== false && Boolean(agent?.publicWebCallEnabled);
  const showBusinessInfo = bio.showBusinessInfo !== false;
  const showSocialLinks = bio.showSocialLinks === true;
  const showQuickTopics = bio.showQuickTopics === true;
  const showTopBar = bio.showTopBar !== false;
  const showAgentImage = bio.showAgentImage !== false;
  const showLogo = bio.showLogo !== false;
  const layoutVariant = bio.layoutVariant || "centered_minimal";
  const primaryCta = text(bio.primaryCtaText || bio.ctaText, "Talk to AI Agent");
  const quickTopics = (Array.isArray(bio.quickTopics) && bio.quickTopics.length ? bio.quickTopics : defaultQuickTopics)
    .filter((topic) => topic.isVisible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, 8);
  const coverImageUrl = assetUrl(bio.coverImageUrl);
  const profile = {
    title: text(bio.headline || agent?.publicTitle || agent?.agentName || agent?.name, "Coaching Center AI"),
    subtitle: publicText(
      bio.subheadline || agent?.publicDescription || agent?.publicWelcomeMessage,
      "Your intelligent admissions advisor - guiding students through courses, admissions, scholarships and career decisions."
    ),
    welcome: text(
      bio.welcomeMessage || agent?.publicWelcomeMessage,
      "Hi! I'm your admissions advisor. Ask me about courses, fees or scholarships - or book a free counselling session."
    ),
    businessName: text(businessInfo.businessName || agent?.businessName, "Coaching Center"),
    category: text(businessInfo.category || agent?.businessCategory, "Education"),
    location: text(businessInfo.location || agent?.businessLocation, "Kota, Rajasthan"),
    availability: text(businessInfo.availability, "Online now"),
    responseTime: text(businessInfo.responseTime, "< 30 sec"),
    cta: primaryCta,
    secondaryCta: text(bio.secondaryCtaText, "Book Appointment"),
    voiceCta: text(bio.voiceCallCtaText, "Voice Call"),
    logoUrl: assetUrl(bio.logoUrl),
    agentImageUrl: assetUrl(bio.agentImageUrl || bio.logoUrl),
    coverImageUrl,
    socialLinks
  };

  // Build the CSS-variable theme entirely from the saved bioPage tokens.
  const primaryColor = clampHex(bio.primaryColor, "#2563EB");
  const buttonColor = clampHex(bio.buttonColor, primaryColor);
  const backgroundColor = clampHex(bio.backgroundColor, "#F8FAFC");
  const cardColor = clampHex(bio.cardColor, "#FFFFFF");
  const textColor = clampHex(bio.textColor, "#0F172A");
  const accentColor = clampHex(bio.accentColor, "#DBEAFE");
  const mutedColor = clampHex(bio.mutedColor, "#64748B");
  const borderColor = clampHex(bio.borderColor, "#E2E8F0");
  const fontFallback = FONT_STYLE_FALLBACK[bio.fontStyle] || FONT_STYLE_FALLBACK.modern;
  const pageStyle = {
    "--accent": primaryColor,
    "--accent-d": shade(primaryColor, -0.18),
    "--accent-soft": accentColor,
    "--accent-tint": rgba(primaryColor, 0.14),
    "--btn": buttonColor,
    "--btn-d": shade(buttonColor, -0.14),
    "--btn-ink": "#FFFFFF",
    "--bg": backgroundColor,
    "--bg-2": shade(backgroundColor, -0.04),
    "--panel": cardColor,
    "--panel-soft": rgba(primaryColor, 0.05),
    "--line": borderColor,
    "--text": textColor,
    "--muted": mutedColor,
    "--radius": RADIUS_PX[bio.borderRadius] || "18px",
    "--button-radius": RADIUS_PX[bio.buttonRadius] || "14px",
    "--heading-font": fontStack(bio.headingFont || fontFallback.heading),
    "--body-font": fontStack(bio.bodyFont || fontFallback.body),
    "--heading-weight": bio.headingWeight || "800",
    "--heading-tracking": TRACKING_EM[bio.headingTracking] || "-0.02em",
    "--body-size": BODY_PX[bio.bodySize] || "15.5px",
    "--content-max": CONTENT_MAX[bio.contentWidth] || "1080px"
  };
  const landingProps = {
    bio,
    profile,
    layoutVariant,
    showBusinessInfo,
    showSocialLinks,
    showQuickTopics,
    showAppointment,
    showVoiceCall,
    showAgentImage,
    showLogo,
    quickTopics,
    coverImageUrl
  };

  useEffect(() => {
    if (!agent || messages.length) return;
    setMessages([{ id: Date.now(), role: "assistant", text: profile.welcome }]);
  }, [agent, messages.length, profile.welcome]);

  useEffect(() => {
    if (!seedPrompt || seededRef.current === seedPrompt.id) return;
    seededRef.current = seedPrompt.id;
    setView("chat");
    const timer = setTimeout(() => sendChatText(seedPrompt.prompt), 250);
    return () => clearTimeout(timer);
  }, [seedPrompt]);

  async function sendChatText(rawText) {
    const trimmed = rawText.trim();
    if (!trimmed || !agent?.publicChatEnabled || chatLoading) return;

    setMessage("");
    setChatLoading(true);
    setError("");
    setMessages((current) => [...current, { id: `${Date.now()}-user`, role: "user", text: trimmed }]);
    triggerRobotReaction();

    try {
      const result = await api(`/public/agents/${publicSlug}/chat`, {
        method: "POST",
        auth: false,
        body: { message: trimmed, sessionId }
      });
      setMessages((current) => [...current, { id: `${Date.now()}-assistant`, role: "assistant", text: result.reply || result.response }]);
      triggerRobotReaction();
    } catch (err) {
      setError(err.message);
      setMessages((current) => [...current, { id: `${Date.now()}-error`, role: "assistant", text: "Message failed. Please try again.", error: true }]);
    } finally {
      setChatLoading(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    await sendChatText(message);
  }

  function openChat(prompt = "") {
    setView("chat");
    if (prompt) setSeedPrompt({ prompt, id: Date.now() });
  }

  // Opens the animated voice-call popup. The modal plays a short connecting animation and then
  // invokes startWebCall() (the real Vapi flow) so the existing call logic stays untouched.
  function launchVoiceCall() {
    if (!agent?.publicWebCallEnabled) {
      setNotice("Voice calling is not enabled for this assistant yet. You can continue in chat.");
      setView("chat");
      return;
    }
    setError("");
    setNotice("");
    setCallStatus("connecting");
    setVoiceModalOpen(true);
  }

  function closeVoiceModal() {
    try {
      vapiRef.current?.stop();
    } catch {
      // ignore – call may not have started yet
    }
    vapiRef.current = null;
    setVoiceModalOpen(false);
    setCallStatus("idle");
  }

  async function startWebCall() {
    if (!agent?.publicWebCallEnabled) {
      setNotice("Voice calling is not enabled for this assistant yet. You can continue in chat.");
      setView("chat");
      return;
    }

    setError("");
    setNotice("");
    setCallStatus("connecting");

    try {
      await requestMicrophoneAccess();
      const cfg = await api(`/public/agents/${publicSlug}/web-call-config`, { method: "GET", auth: false });

      vapiRef.current = startVapiWebCall({
        publicKey: cfg.publicKey,
        assistantId: cfg.assistantId,
        metadata: { publicSlug, channel: "web" },
        handlers: {
          onCallStart: () => setCallStatus("connected"),
          onCallEnd: () => setCallStatus("ended"),
          onError: (err) => {
            setError(err?.message || "Web call failed.");
            setCallStatus("error");
          }
        }
      });
    } catch (err) {
      setError(err.message || "Web call failed.");
      setCallStatus("error");
    }
  }

  async function endWebCall() {
    try {
      vapiRef.current?.stop();
    } finally {
      vapiRef.current = null;
      setCallStatus("ended");
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-[#64748b]">Loading...</main>;

  if (error && !agent) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] p-4 text-center text-rose-700">{error}</main>;
  }

  return (
    <main
      className={`vf-theme vf-public-page vf-template-${bio.template || "coaching_education"} vf-layout-${layoutVariant} vf-bg-${bio.backgroundStyle || "soft_gradient"} vf-space-${bio.spacingScale || "comfortable"} vf-shadow-${bio.cardShadow || "soft"} vf-border-${bio.cardBorder || "subtle"} vf-anim-${bio.animation || "fade_in"} min-h-screen`}
      style={pageStyle}
    >
      <style>{themeCss}</style>
      {showTopBar && (
        <PublicPageNavbar
          profile={profile}
          view={view}
          showLogo={showLogo}
          showBusinessInfo={showBusinessInfo}
          showAppointment={showAppointment}
          onHome={() => setView("landing")}
        />
      )}

      {view === "landing" && (
        <LandingRenderer
          {...landingProps}
          onStart={() => openChat()}
          onCall={launchVoiceCall}
          onBook={() => setView("booking")}
          onTile={(cat) => openChat(cat.prompt || cat.title)}
        />
      )}
      {view === "chat" && (
        <Chat
          profile={profile}
          messages={messages}
          input={message}
          setInput={setMessage}
          onSubmit={sendMessage}
          typing={chatLoading}
          error={error}
          notice={notice}
          chatEnabled={agent?.publicChatEnabled}
          onBack={() => setView("landing")}
          onCall={launchVoiceCall}
          onBook={() => setView("booking")}
          showAppointment={showAppointment}
          showVoiceCall={showVoiceCall}
          quickTopics={quickTopics}
          onSuggestion={(prompt) => sendChatText(prompt)}
        />
      )}
      {view === "booking" && (
        <Booking profile={profile} agent={agent} onBack={() => setView("landing")} onChat={() => openChat()} />
      )}

      {voiceModalOpen && (
        <VoiceCallModal
          profile={profile}
          status={callStatus}
          error={error}
          onStart={startWebCall}
          onEnd={endWebCall}
          onRetry={startWebCall}
          onClose={closeVoiceModal}
          onChat={() => {
            closeVoiceModal();
            openChat();
          }}
        />
      )}
    </main>
  );
}

function isOnlineStatus(value) {
  return !/(offline|closed|unavailable|away)/i.test(String(value || ""));
}

function businessIconFor(category = "") {
  if (/restaurant|food|cafe|hotel|menu|dining/i.test(category)) return Utensils;
  if (/store|shop|retail/i.test(category)) return Store;
  if (/school|college|course|education|coaching|admission/i.test(category)) return BookOpen;
  if (/business|consult|service|agency/i.test(category)) return Briefcase;
  return Building2;
}

function PublicPageNavbar({ profile, view, showLogo = true, showBusinessInfo, showAppointment, onHome }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const online = isOnlineStatus(profile.availability);
  const BusinessIcon = businessIconFor(profile.category);
  const navItems = [
    { id: "vf-public-hero", label: "Home", Icon: Home },
    { id: "vf-public-about", label: "About", Icon: Info },
    { id: "vf-public-features", label: showAppointment ? "Services" : "Features", Icon: showAppointment ? CalendarDays : Sparkles },
    ...(showBusinessInfo ? [{ id: "vf-public-meta", label: "Location", Icon: MapPin }] : [])
  ];

  function goToSection(id) {
    if (view !== "landing") {
      onHome();
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setMenuOpen(false);
  }

  return (
    <header className="vf-public-nav-shell sticky top-0 z-30">
      <nav className="vf-public-nav vf-landing">
        <button
          onClick={() => goToSection("vf-public-hero")}
          className="vf-public-brand"
          aria-label="Home"
        >
          {showLogo && (
            <span className="vf-public-brand-avatar">
              <Robot size={44} src={profile.agentImageUrl || profile.logoUrl} glow={false} float={false} />
            </span>
          )}
          <span className="vf-public-brand-copy">
            <span className="vf-public-brand-title">{profile.businessName || profile.title}</span>
            <span className="vf-public-brand-sub">
              <BusinessIcon size={14} />
              <span>{profile.category}</span>
              <span className="vf-public-dot" />
              <span>{online ? "Online now" : profile.availability}</span>
            </span>
          </span>
        </button>

        <div className="vf-public-nav-items" aria-label="Page sections">
          {navItems.map(({ id, label, Icon }, index) => (
            <button
              key={id}
              onClick={() => goToSection(id)}
              className={`vf-public-nav-link ${index === 0 ? "is-active" : ""}`}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="vf-public-nav-actions">
          {view !== "landing" && (
            <button onClick={onHome} className="vf-public-back">
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Home</span>
            </button>
          )}
          <span className={`vf-public-online-pill ${online ? "" : "is-offline"}`}>
            {online ? <GreenDot /> : <span className="vf-public-offline-dot" />}
            {online ? "Online now" : profile.availability}
          </span>
          <button
            className="vf-public-menu"
            onClick={() => setMenuOpen((current) => !current)}
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {menuOpen && (
          <div className="vf-public-mobile-menu">
            {navItems.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => goToSection(id)}>
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
        )}
      </nav>
    </header>
  );
}

// ---------------------------------------------------------------------------
// LandingRenderer — switches the WHOLE page structure on layoutVariant so each
// template renders a genuinely different landing page, not just a recolor.
// ---------------------------------------------------------------------------
function LandingRenderer(props) {
  return <ModernPublicLanding {...props} />;
}

// ---- Shared landing building blocks ---------------------------------------
function ModernPublicLanding({ profile, showBusinessInfo, showSocialLinks, showAppointment, showVoiceCall, showAgentImage, onStart, onCall, onBook }) {
  return (
    <div className="vf-public-shell vf-enter">
      <section id="vf-public-hero" className="vf-public-hero-card">
        <DecorativeHeroBackground />
        <div className="vf-public-hero-grid">
          <HeroAssistantVisual profile={profile} showAgentImage={showAgentImage} />
          <AssistantInfo
            profile={profile}
            showBusinessInfo={showBusinessInfo}
            showAppointment={showAppointment}
            showVoiceCall={showVoiceCall}
            onStart={onStart}
            onCall={onCall}
            onBook={onBook}
          />
        </div>
      </section>

      <FeaturesSection showAppointment={showAppointment} showVoiceCall={showVoiceCall} />
      {showSocialLinks && (
        <section className="vf-public-social">
          <SocialRow socialLinks={profile.socialLinks} />
        </section>
      )}
    </div>
  );
}

function DecorativeHeroBackground() {
  return (
    <div className="vf-public-hero-decor" aria-hidden="true">
      <span className="vf-public-dots vf-public-dots-a" />
      <span className="vf-public-dots vf-public-dots-b" />
      <span className="vf-public-ring vf-public-ring-a" />
      <span className="vf-public-ring vf-public-ring-b" />
      <span className="vf-public-glow vf-public-glow-a" />
      <span className="vf-public-glow vf-public-glow-b" />
      <span className="vf-public-curve" />
    </div>
  );
}

function HeroAssistantVisual({ profile, showAgentImage }) {
  const badges = [
    { className: "is-message", Icon: MessageCircle },
    { className: "is-zap", Icon: Zap },
    { className: "is-headphones", Icon: Headphones },
    { className: "is-wave", Icon: AudioWaveform }
  ];

  return (
    <div className="vf-public-visual" aria-hidden={!showAgentImage}>
      <div className="vf-public-visual-ring">
        <div className="vf-public-visual-inner">
          {showAgentImage ? (
            <Robot size={360} src={profile.agentImageUrl || profile.logoUrl} glow float />
          ) : (
            <span className="vf-public-bot-placeholder">
              <Bot size={96} />
            </span>
          )}
        </div>
      </div>
      {badges.map(({ className, Icon }) => (
        <span key={className} className={`vf-public-float-badge ${className}`}>
          <Icon size={28} />
        </span>
      ))}
    </div>
  );
}

function AssistantInfo({ profile, showBusinessInfo, showAppointment, showVoiceCall, onStart, onCall, onBook }) {
  return (
    <div id="vf-public-about" className="vf-public-info">
      <AiPill />
      <h1 className="vf-public-title">{profile.title}</h1>
      <p className="vf-public-description">{profile.subtitle}</p>
      <StatusPills profile={profile} showVoiceCall={showVoiceCall} />
      <ActionButtons
        profile={profile}
        showAppointment={showAppointment}
        showVoiceCall={showVoiceCall}
        onStart={onStart}
        onCall={onCall}
        onBook={onBook}
      />
      {showBusinessInfo && <BusinessMeta profile={profile} />}
    </div>
  );
}

function StatusPills({ profile, showVoiceCall }) {
  const online = isOnlineStatus(profile.availability);
  const pills = [
    { key: "status", label: online ? "Online now" : profile.availability, icon: online ? "dot" : "offline", tone: online ? "green" : "muted" },
    { key: "fast", label: profile.responseTime ? `Fast response` : "Fast response", Icon: Zap },
    { key: "ai", label: "AI assistant", Icon: Sparkles }
  ];
  if (showVoiceCall) pills.push({ key: "voice", label: "Voice enabled", Icon: Headphones });

  return (
    <div className="vf-public-pills">
      {pills.map(({ key, label, Icon, icon, tone }) => (
        <span key={key} className={`vf-public-status-pill ${tone === "green" ? "is-green" : ""}`}>
          {icon === "dot" ? <GreenDot /> : icon === "offline" ? <span className="vf-public-offline-dot" /> : <Icon size={16} />}
          {label}
        </span>
      ))}
    </div>
  );
}

function ActionButtons({ profile, showVoiceCall, showAppointment, onStart, onCall, onBook }) {
  return (
    <div className="vf-public-actions">
      <button className="vf-public-primary-action" onClick={onStart}>
        <MessageCircle size={23} />
        <span>{profile.cta}</span>
        <ArrowRight size={23} />
      </button>
      {(showAppointment || showVoiceCall) && (
        <div className="vf-public-secondary-actions">
          {showAppointment && (
            <button className="vf-public-secondary-action is-booking" onClick={onBook}>
              <CalendarDays size={21} />
              <span>{profile.secondaryCta}</span>
            </button>
          )}
          {showVoiceCall && (
            <button className="vf-public-secondary-action is-voice" onClick={onCall}>
              <Headphones size={21} />
              <span>{profile.voiceCta}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BusinessMeta({ profile }) {
  const BusinessIcon = businessIconFor(profile.category);
  return (
    <div id="vf-public-meta" className="vf-public-meta">
      <span>
        <BusinessIcon size={19} />
        {profile.category}
      </span>
      <span className="vf-public-meta-divider" />
      <span>
        <MapPin size={19} />
        {profile.location}
      </span>
    </div>
  );
}

function FeaturesSection({ showAppointment, showVoiceCall }) {
  const cards = [
    { title: "AI Assistant", description: "Get instant answers to your questions.", Icon: MessageCircle, tone: "purple" },
    { title: "Fast Response", description: "Receive quick help whenever you need it.", Icon: Zap, tone: "green" },
    ...(showVoiceCall ? [{ title: "Voice Enabled", description: "Speak naturally with the assistant.", Icon: Headphones, tone: "blue" }] : []),
    ...(showAppointment ? [{ title: "Easy Booking", description: "Book appointments or reservations in seconds.", Icon: CalendarDays, tone: "orange" }] : [])
  ];

  return (
    <section id="vf-public-features" className="vf-public-features" aria-label="Assistant features">
      {cards.map((card) => (
        <FeatureCard key={card.title} {...card} />
      ))}
    </section>
  );
}

function FeatureCard({ title, description, Icon, tone }) {
  return (
    <article className="vf-public-feature-card">
      <span className={`vf-public-feature-icon is-${tone}`}>
        <Icon size={28} />
      </span>
      <span className="vf-public-feature-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
    </article>
  );
}

function TrustChips({ showVoiceCall, align = "center" }) {
  const chips = [
    { icon: "dot", label: "Online now" },
    { Icon: Zap, label: "Fast response" },
    { Icon: Sparkles, label: "AI assistant" }
  ];
  if (showVoiceCall) chips.push({ Icon: Headphones, label: "Voice enabled" });

  return (
    <div className={`mt-6 flex flex-wrap gap-2 ${align === "left" ? "justify-center lg:justify-start" : "justify-center"}`}>
      {chips.map(({ Icon, label, icon }) => (
        <span key={label} className="vf-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold">
          {icon === "dot" ? <GreenDot /> : <Icon size={14} className="vf-accent-ink" />}
          {label}
        </span>
      ))}
    </div>
  );
}

// Primary + secondary calls to action. bookingPrimary promotes the appointment
// button to the hero position (used by booking-first / appointment-first layouts).
function Actions({ profile, showVoiceCall, showAppointment, onStart, onCall, onBook, bookingPrimary = false }) {
  const bookAsPrimary = bookingPrimary && showAppointment;

  const primary = bookAsPrimary ? (
    <button className="vf-btn vf-btn-primary vf-cta w-full" onClick={onBook}>
      <CalendarDays size={19} /> {profile.secondaryCta} <ArrowRight size={18} className="ml-auto" />
    </button>
  ) : (
    <button className="vf-btn vf-btn-primary vf-cta w-full" onClick={onStart}>
      <MessageCircle size={19} /> {profile.cta} <ArrowRight size={18} className="ml-auto" />
    </button>
  );

  const secondary = [];
  if (bookAsPrimary) {
    secondary.push(
      <button key="chat" className="vf-btn vf-btn-ghost vf-cta-sec" onClick={onStart}>
        <MessageCircle size={18} /> {profile.cta}
      </button>
    );
  } else if (showAppointment) {
    secondary.push(
      <button key="book" className="vf-btn vf-btn-ghost vf-cta-sec" onClick={onBook}>
        <CalendarDays size={18} /> {profile.secondaryCta}
      </button>
    );
  }
  if (showVoiceCall) {
    secondary.push(
      <button key="call" className="vf-btn vf-btn-soft vf-cta-sec" onClick={onCall} title="Start a voice call">
        <Headphones size={18} /> {profile.voiceCta}
      </button>
    );
  }

  return (
    <div className="vf-actions flex w-full flex-col gap-3">
      {primary}
      {secondary.length > 0 && (
        <div className={`grid gap-3 ${secondary.length > 1 ? "sm:grid-cols-2" : ""}`}>{secondary}</div>
      )}
    </div>
  );
}

function BusinessInfoCard({ profile, flat = false }) {
  return (
    <div className={`${flat ? "vf-info-flat" : "vf-glass"} vf-info-card rounded-[var(--radius)] p-2 sm:p-3`}>
      <InfoRow icon={Building2} label="Business" value={profile.businessName} first />
      <InfoRow icon={BookOpen} label="Category" value={profile.category} />
      <InfoRow icon={MapPin} label="Location" value={profile.location} />
      <InfoRow icon={Sparkles} label="Availability" value={profile.availability} dot />
      <InfoRow icon={Zap} label="Response Time" value={profile.responseTime} />
    </div>
  );
}

// Business details shown as trust badges (clinic / finance layouts).
function TrustBadges({ profile }) {
  const badges = [
    { Icon: ShieldCheck, label: "Verified", value: profile.businessName },
    { Icon: MapPin, label: "Location", value: profile.location },
    { Icon: Clock, label: "Availability", value: profile.availability },
    { Icon: Zap, label: "Response", value: profile.responseTime }
  ];
  return (
    <div className="vf-badges grid w-full gap-3 sm:grid-cols-2">
      {badges.map(({ Icon, label, value }) => (
        <div key={label} className="vf-badge flex items-center gap-3 rounded-[var(--radius)] p-3.5 text-left">
          <span className="vf-icon-orb h-[38px] w-[38px] flex-none rounded-xl"><Icon size={18} /></span>
          <span className="min-w-0">
            <span className="vf-muted block text-[11.5px] font-bold uppercase tracking-wide">{label}</span>
            <span className="block truncate text-[14px] font-extrabold">{value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function SocialRow({ socialLinks }) {
  const items = [
    { key: "website", Icon: Globe, href: socialLinks.website },
    { key: "instagram", Icon: Instagram, href: socialLinks.instagram },
    { key: "facebook", Icon: Facebook, href: socialLinks.facebook },
    { key: "whatsapp", Icon: MessageCircle, href: socialLinks.whatsapp },
    { key: "linkedin", Icon: Linkedin, href: socialLinks.linkedin }
  ].filter((item) => item.href && String(item.href).trim());

  if (!items.length) return null;
  return (
    <div className="vf-social flex flex-wrap items-center justify-center gap-2.5">
      {items.map(({ key, Icon, href }) => (
        <a
          key={key}
          href={/^https?:\/\//i.test(href) ? href : `https://${href}`}
          target="_blank"
          rel="noreferrer noopener"
          className="vf-social-btn grid h-11 w-11 place-items-center rounded-full"
          aria-label={key}
        >
          <Icon size={18} />
        </a>
      ))}
    </div>
  );
}

// Optional "Action Cards" (formerly Quick Topics). Only ever rendered when the
// user explicitly enables showQuickTopics — off by default to keep pages clean.
function ActionCards({ quickTopics, onTile }) {
  if (!quickTopics.length) return null;
  return (
    <section className="vf-actioncards mt-10 w-full sm:mt-12">
      <div className="mb-4">
        <h2 className="vf-muted text-[12.5px] font-extrabold uppercase tracking-[.12em]">Quick actions</h2>
        <p className="mt-0.5 text-[15px] font-bold">How can we help?</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickTopics.map((cat, index) => (
          <CategoryTile key={cat.id || index} cat={cat} onClick={onTile} />
        ))}
      </div>
    </section>
  );
}

function HeroHeadline({ profile, size = "default", onLight = false }) {
  return (
    <>
      <h1 className={`vf-h1 ${size === "large" ? "vf-h1-lg" : ""} ${onLight ? "text-white" : ""}`}>{profile.title}</h1>
      <p className={`vf-sub mt-4 ${onLight ? "text-white/85" : ""}`}>{profile.subtitle}</p>
    </>
  );
}

// 1) Minimal Professional — narrow, centered, airy. Small avatar, two clean CTAs,
//    business info collapsed to one compact inline row.
function CenteredMinimalLanding({ profile, showBusinessInfo, showSocialLinks, showQuickTopics, showAppointment, showVoiceCall, showAgentImage, quickTopics, onStart, onCall, onBook, onTile }) {
  return (
    <div className="vf-landing vf-landing-narrow vf-enter flex flex-col items-center px-4 py-10 text-center sm:px-6 sm:py-16">
      {showAgentImage && (
        <span className="vf-avatar-frame mb-6 grid h-[92px] w-[92px] place-items-center rounded-2xl">
          <Robot size={72} src={profile.agentImageUrl} glow={false} float={false} />
        </span>
      )}
      <AiPill />
      <div className="mt-5">
        <HeroHeadline profile={profile} />
      </div>
      <div className="mt-8 w-full max-w-[420px]">
        <Actions profile={profile} showAppointment={showAppointment} showVoiceCall={showVoiceCall} onStart={onStart} onCall={onCall} onBook={onBook} />
      </div>
      {showBusinessInfo && (
        <div className="vf-inline-stats mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <span className="vf-inline-stat"><BookOpen size={14} /> {profile.category}</span>
          <span className="vf-inline-dot" />
          <span className="vf-inline-stat"><MapPin size={14} /> {profile.location}</span>
          <span className="vf-inline-dot" />
          <span className="vf-inline-stat"><Zap size={14} /> {profile.responseTime}</span>
        </div>
      )}
      {showSocialLinks && <div className="mt-7"><SocialRow socialLinks={profile.socialLinks} /></div>}
      {showQuickTopics && <ActionCards quickTopics={quickTopics} onTile={onTile} />}
    </div>
  );
}

// 2) Modern SaaS — split hero: content left, glassy AI agent card right.
function SplitSaasLanding({ profile, showBusinessInfo, showSocialLinks, showQuickTopics, showAppointment, showVoiceCall, showAgentImage, quickTopics, onStart, onCall, onBook, onTile }) {
  return (
    <div className="vf-landing vf-enter px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
        <section className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <AiPill />
          <div className="mt-6">
            <HeroHeadline profile={profile} size="large" />
          </div>
          <TrustChips showVoiceCall={showVoiceCall} align="left" />
          <div className="mt-8 w-full max-w-[440px]">
            <Actions profile={profile} showAppointment={showAppointment} showVoiceCall={showVoiceCall} onStart={onStart} onCall={onCall} onBook={onBook} />
          </div>
          {showSocialLinks && <div className="mt-7 w-full"><SocialRow socialLinks={profile.socialLinks} /></div>}
        </section>

        <section className="w-full">
          <div className="vf-glass vf-agent-card rounded-[var(--radius)] p-5 sm:p-6">
            {showAgentImage && (
              <div className="vf-hero-visual grid place-items-center rounded-[var(--radius)] p-6">
                <Robot size={190} src={profile.agentImageUrl} glow float />
              </div>
            )}
            <div className="mt-4 flex items-center gap-2 px-1">
              <GreenDot /><span className="text-[13px] font-bold">{profile.availability}</span>
            </div>
            {showBusinessInfo && <div className="mt-3"><BusinessInfoCard profile={profile} flat /></div>}
          </div>
        </section>
      </div>
      {showQuickTopics && <ActionCards quickTopics={quickTopics} onTile={onTile} />}
    </div>
  );
}

// 3) Local Service Business — cover banner hero, business info card + actions below.
function CoverServiceLanding({ profile, showBusinessInfo, showSocialLinks, showQuickTopics, showAppointment, showVoiceCall, showAgentImage, quickTopics, coverImageUrl, onStart, onCall, onBook, onTile }) {
  return (
    <div className="vf-landing vf-enter px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="vf-cover-banner rounded-[var(--radius)]" style={coverImageUrl ? { backgroundImage: `url(${coverImageUrl})` } : undefined}>
        <div className="vf-cover-banner-body">
          {showAgentImage && (
            <span className="vf-avatar-frame grid h-[74px] w-[74px] flex-none place-items-center rounded-2xl">
              <Robot size={58} src={profile.agentImageUrl} glow={false} float={false} />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="vf-h1 vf-cover-title">{profile.title}</h1>
            <p className="vf-cover-sub mt-1.5">{profile.category} · {profile.location}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_.82fr]">
        <section className="flex flex-col gap-5">
          <p className="vf-sub">{profile.subtitle}</p>
          <Actions profile={profile} showAppointment={showAppointment} showVoiceCall={showVoiceCall} onStart={onStart} onCall={onCall} onBook={onBook} />
          {showSocialLinks && <SocialRow socialLinks={profile.socialLinks} />}
        </section>
        {showBusinessInfo && (
          <section><BusinessInfoCard profile={profile} /></section>
        )}
      </div>
      {showQuickTopics && <ActionCards quickTopics={quickTopics} onTile={onTile} />}
    </div>
  );
}

// 4) Coaching & Admissions — prominent advisor image, warm, appointment CTA visible.
function EducationAdvisorLanding({ profile, showBusinessInfo, showSocialLinks, showQuickTopics, showAppointment, showVoiceCall, showAgentImage, quickTopics, onStart, onCall, onBook, onTile }) {
  return (
    <div className="vf-landing vf-enter px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-[.85fr_1.15fr]">
        {showAgentImage && (
          <section className="order-1 flex justify-center lg:order-none">
            <div className="vf-advisor-visual grid place-items-center rounded-[var(--radius)] p-6 sm:p-8">
              <Robot size={240} src={profile.agentImageUrl} glow float />
            </div>
          </section>
        )}
        <section className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <AiPill />
          <div className="mt-5">
            <HeroHeadline profile={profile} size="large" />
          </div>
          <TrustChips showVoiceCall={showVoiceCall} align="left" />
          <div className="mt-8 w-full max-w-[460px]">
            <Actions profile={profile} showAppointment={showAppointment} showVoiceCall={showVoiceCall} onStart={onStart} onCall={onCall} onBook={onBook} />
          </div>
          {showBusinessInfo && (
            <div className="vf-inline-stats mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="vf-inline-stat"><BookOpen size={14} /> {profile.category}</span>
              <span className="vf-inline-dot" />
              <span className="vf-inline-stat"><MapPin size={14} /> {profile.location}</span>
            </div>
          )}
          {showSocialLinks && <div className="mt-6"><SocialRow socialLinks={profile.socialLinks} /></div>}
        </section>
      </div>
      {showQuickTopics && <ActionCards quickTopics={quickTopics} onTile={onTile} />}
    </div>
  );
}

// 5) Clinic — calm, centered trust card, appointment-first CTA, trust badges.
function ClinicTrustLanding({ profile, showBusinessInfo, showSocialLinks, showQuickTopics, showAppointment, showVoiceCall, showAgentImage, quickTopics, onStart, onCall, onBook, onTile }) {
  return (
    <div className="vf-landing vf-landing-mid vf-enter flex flex-col items-center px-4 py-10 sm:px-6 sm:py-14">
      <div className="vf-glass vf-trust-card w-full rounded-[var(--radius)] p-6 text-center sm:p-9">
        {showAgentImage && (
          <div className="mb-2 flex justify-center">
            <Robot size={124} src={profile.agentImageUrl} glow float />
          </div>
        )}
        <HeroHeadline profile={profile} />
        <div className="mx-auto mt-7 w-full max-w-[440px]">
          <Actions profile={profile} showAppointment={showAppointment} showVoiceCall={showVoiceCall} onStart={onStart} onCall={onCall} onBook={onBook} bookingPrimary />
        </div>
      </div>
      {showBusinessInfo && <div className="mt-6 w-full"><TrustBadges profile={profile} /></div>}
      {showSocialLinks && <div className="mt-7"><SocialRow socialLinks={profile.socialLinks} /></div>}
      {showQuickTopics && <ActionCards quickTopics={quickTopics} onTile={onTile} />}
    </div>
  );
}

// 6) Real Estate — premium full-width cover hero with overlay + gold CTA.
function RealEstateCoverLanding({ profile, showBusinessInfo, showSocialLinks, showQuickTopics, showAppointment, showVoiceCall, quickTopics, coverImageUrl, onStart, onCall, onBook, onTile }) {
  return (
    <div className="vf-landing vf-enter px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="vf-cover-hero rounded-[var(--radius)]" style={coverImageUrl ? { backgroundImage: `url(${coverImageUrl})` } : undefined}>
        <div className="vf-cover-hero-inner">
          <AiPill onDark />
          <div className="mt-5 max-w-[620px]">
            <HeroHeadline profile={profile} size="large" onLight />
          </div>
          <div className="mt-8 w-full max-w-[460px]">
            <Actions profile={profile} showAppointment={showAppointment} showVoiceCall={showVoiceCall} onStart={onStart} onCall={onCall} onBook={onBook} />
          </div>
        </div>
      </div>
      {(showBusinessInfo || showSocialLinks) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_.7fr]">
          {showBusinessInfo && <BusinessInfoCard profile={profile} />}
          {showSocialLinks && (
            <div className="flex items-center justify-center lg:justify-start">
              <SocialRow socialLinks={profile.socialLinks} />
            </div>
          )}
        </div>
      )}
      {showQuickTopics && <ActionCards quickTopics={quickTopics} onTile={onTile} />}
    </div>
  );
}

// 7) Restaurant — warm, booking-first with a highlighted reservation panel.
function BookingFirstLanding({ profile, showBusinessInfo, showSocialLinks, showQuickTopics, showAppointment, showVoiceCall, showAgentImage, quickTopics, onStart, onCall, onBook, onTile }) {
  return (
    <div className="vf-landing vf-landing-mid vf-enter flex flex-col items-center px-4 py-10 text-center sm:px-6 sm:py-14">
      {showAgentImage && <Robot size={128} src={profile.agentImageUrl} glow float />}
      <div className="mt-3">
        <HeroHeadline profile={profile} />
      </div>
      <div className="vf-reserve-panel mt-8 w-full rounded-[var(--radius)] p-4 sm:p-5">
        <Actions profile={profile} showAppointment={showAppointment} showVoiceCall={showVoiceCall} onStart={onStart} onCall={onCall} onBook={onBook} bookingPrimary />
        <div className="vf-reserve-meta mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          <span className="vf-inline-stat"><Clock size={14} /> {profile.availability}</span>
          <span className="vf-inline-stat"><MapPin size={14} /> {profile.location}</span>
        </div>
      </div>
      {showBusinessInfo && (
        <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
          <div className="vf-soft-tile rounded-[var(--radius)] p-4 text-left">
            <MapPin size={18} className="vf-accent-ink" />
            <p className="mt-2 text-[12px] font-bold uppercase tracking-wide vf-muted">Find us</p>
            <p className="text-[14.5px] font-extrabold">{profile.location}</p>
          </div>
          <div className="vf-soft-tile rounded-[var(--radius)] p-4 text-left">
            <Clock size={18} className="vf-accent-ink" />
            <p className="mt-2 text-[12px] font-bold uppercase tracking-wide vf-muted">Timings</p>
            <p className="text-[14.5px] font-extrabold">{profile.availability}</p>
          </div>
        </div>
      )}
      {showSocialLinks && <div className="mt-7"><SocialRow socialLinks={profile.socialLinks} /></div>}
      {showQuickTopics && <ActionCards quickTopics={quickTopics} onTile={onTile} />}
    </div>
  );
}

// 8) Finance — conservative, left-aligned, trust points panel + trust badges.
function FinanceTrustLanding({ profile, showBusinessInfo, showSocialLinks, showQuickTopics, showAppointment, showVoiceCall, showAgentImage, quickTopics, onStart, onCall, onBook, onTile }) {
  const points = ["Clear, jargon-free guidance", "Your details stay private", "Fast eligibility answers"];
  return (
    <div className="vf-landing vf-enter px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="grid items-stretch gap-8 lg:grid-cols-[1.1fr_.9fr]">
        <section className="flex flex-col justify-center text-center lg:text-left">
          <div className="flex justify-center lg:justify-start"><AiPill /></div>
          <div className="mt-5">
            <HeroHeadline profile={profile} size="large" />
          </div>
          <div className="mt-8 w-full max-w-[460px] self-center lg:self-start">
            <Actions profile={profile} showAppointment={showAppointment} showVoiceCall={showVoiceCall} onStart={onStart} onCall={onCall} onBook={onBook} />
          </div>
          {showSocialLinks && <div className="mt-6 flex justify-center lg:justify-start"><SocialRow socialLinks={profile.socialLinks} /></div>}
        </section>

        <section className="vf-glass vf-finance-panel flex flex-col rounded-[var(--radius)] p-6 sm:p-7">
          <div className="flex items-center gap-3">
            {showAgentImage && <Robot size={64} src={profile.agentImageUrl} glow={false} float={false} />}
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold">{profile.businessName}</p>
              <p className="vf-muted text-[13px] font-semibold">{profile.category}</p>
            </div>
          </div>
          <ul className="vf-trust-points mt-5 flex flex-col gap-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-[14px] font-semibold">
                <span className="vf-check grid h-5 w-5 flex-none place-items-center rounded-full"><Check size={13} strokeWidth={3} /></span>
                {point}
              </li>
            ))}
          </ul>
        </section>
      </div>
      {showBusinessInfo && <div className="mt-6"><TrustBadges profile={profile} /></div>}
      {showQuickTopics && <ActionCards quickTopics={quickTopics} onTile={onTile} />}
    </div>
  );
}

function Chat({ profile, messages, input, setInput, onSubmit, typing, error, notice, chatEnabled, onBack, onCall, onBook, showAppointment, showVoiceCall, quickTopics, onSuggestion }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  return (
    <div className="vf-enter grid w-full place-items-center px-4 py-5 sm:px-5 sm:py-7">
      <div className="vf-glass flex h-[min(820px,calc(100vh-104px))] w-full max-w-[820px] flex-col overflow-hidden rounded-[26px]">
        <div className="flex items-center gap-3 border-b border-[#d8e4f5] bg-[#ffffff] px-4 py-3.5 sm:px-5">
          <button className="vf-btn vf-btn-ghost p-2.5" onClick={onBack} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <Robot size={42} src={profile.agentImageUrl || profile.logoUrl} glow={false} float={false} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-extrabold">{profile.title}</div>
            <div className="inline-flex items-center gap-1.5 text-[12.5px] text-[#64748b]">{typing ? "typing..." : <><GreenDot /> Online</>}</div>
          </div>
          <div className="ml-auto flex gap-2">
            {showVoiceCall && (
              <button className="vf-btn vf-btn-soft px-3 py-2 text-sm" onClick={onCall}>
                <Headphones size={17} /> <span className="hidden sm:inline">Call</span>
              </button>
            )}
            {showAppointment && (
              <button className="vf-btn vf-btn-ghost px-3 py-2 text-sm" onClick={onBook}>
                <CalendarDays size={17} /> <span className="hidden sm:inline">Book</span>
              </button>
            )}
          </div>
        </div>

        {(error || notice) && (
          <div className="grid gap-2 px-4 pt-4 sm:px-6">
            {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</div>}
            {notice && <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">{notice}</div>}
          </div>
        )}

        <div ref={scrollRef} className="vf-scroll flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.map((item) => (
            <Bubble key={item.id} message={item} profile={profile} />
          ))}
          {typing && <TypingBubble profile={profile} />}
          {messages.length <= 1 && !typing && (
            <div className="mt-1">
              <div className="mb-2.5 text-[12.5px] font-bold text-[#64748b]">SUGGESTED</div>
              <div className="flex flex-wrap gap-2.5">
                {quickTopics.map((cat, index) => {
                  return (
                    <button key={cat.id || index} onClick={() => onSuggestion(cat.prompt || cat.title)} className="vf-card-solid vf-tile inline-flex items-center gap-2 rounded-[14px] px-3.5 py-2.5 text-sm font-semibold">
                      <TopicIcon topic={cat} size={18} />
                      {cat.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <form className="flex items-center gap-2.5 border-t border-[#d8e4f5] bg-[#ffffff] px-3.5 py-3.5 sm:px-5" onSubmit={onSubmit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={chatEnabled ? "Ask about admissions, courses, fees..." : "Chat is not enabled for this agent."}
            disabled={!chatEnabled}
            className="min-w-0 flex-1 rounded-[14px] border border-[#d8e4f5] bg-[#f8fafc] px-4 py-3 text-[15px] text-[#0f172a] outline-none placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:ring-4 focus:ring-[#2563eb]/10"
          />
          <button type="submit" className="vf-btn vf-btn-primary px-4 py-3" disabled={!input.trim() || typing || !chatEnabled} aria-label="Send">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

const CALL_STEPS = [
  { icon: Phone, label: "Connecting" },
  { icon: ShieldCheck, label: "Securing audio" },
  { icon: Headphones, label: "Starting voice call" }
];

function VoiceCallModal({ profile, status, error, onStart, onEnd, onRetry, onClose, onChat }) {
  const [step, setStep] = useState(0);
  const startRef = useRef(onStart);
  const startedRef = useRef(false);
  startRef.current = onStart;

  const isLive = status === "connected";
  const isError = status === "error";
  const isEnded = status === "ended";
  const isConnecting = !isLive && !isError && !isEnded;
  const displayImage = profile.agentImageUrl || profile.logoUrl;

  // Play the scripted connecting animation, then kick off the real Vapi call once.
  useEffect(() => {
    startedRef.current = false;
    setStep(0);
    const t1 = setTimeout(() => setStep(1), 380);
    const t2 = setTimeout(() => setStep(2), 760);
    const t3 = setTimeout(() => {
      if (!startedRef.current) {
        startedRef.current = true;
        startRef.current?.();
      }
    }, 1050);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const activeStep = isLive ? CALL_STEPS.length : step;

  return (
    <div className="vf-modal-overlay" role="dialog" aria-modal="true" onMouseDown={isConnecting ? undefined : onClose}>
      <div className="vf-modal vf-modal-in" onMouseDown={(event) => event.stopPropagation()}>
        <button className="vf-modal-x" onClick={isLive ? onEnd : onClose} aria-label="Close">
          <X size={18} />
        </button>

        {isError ? (
          <div className="flex flex-col items-center text-center">
            <span className="grid h-[68px] w-[68px] place-items-center rounded-full bg-rose-50 text-rose-600">
              <PhoneOff size={30} />
            </span>
            <h3 className="mt-4 text-[20px] font-extrabold">Voice call could not start</h3>
            <p className="mt-1.5 max-w-[300px] text-[14px] text-[#64748b]">
              {error || "Please allow microphone access and try again."}
            </p>
            <div className="mt-6 flex w-full flex-col gap-2.5">
              <button className="vf-btn vf-btn-primary vf-cta w-full px-4" onClick={onRetry}>
                <Headphones size={17} /> Retry
              </button>
              <button className="vf-btn vf-btn-ghost w-full px-4 py-3" onClick={onClose}>
                <X size={16} /> Close
              </button>
            </div>
          </div>
        ) : isEnded ? (
          <div className="flex flex-col items-center text-center">
            <span className="grid h-[68px] w-[68px] place-items-center rounded-full bg-[#dbeafe] text-[#1d4ed8]">
              <Check size={32} strokeWidth={2.6} />
            </span>
            <h3 className="mt-4 text-[20px] font-extrabold">Call ended</h3>
            <p className="mt-1.5 text-[14px] text-[#64748b]">with {profile.title}</p>
            <div className="mt-6 flex w-full gap-2.5">
              <button className="vf-btn vf-btn-ghost flex-1 px-4 py-3" onClick={onChat}>
                <MessageCircle size={16} /> Chat
              </button>
              <button className="vf-btn vf-btn-primary flex-1 px-4 py-3" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-extrabold uppercase tracking-[.1em] text-[#64748b]">
              <GreenDot /> {isLive ? "Live voice call" : "Connecting"}
            </span>

            <div className="relative my-5 grid h-[176px] w-[176px] place-items-center">
              <span className="vf-pulse-ring" />
              <span className="vf-pulse-ring vf-d2" />
              <span className="vf-pulse-ring vf-d3" />
              <span className="vf-call-orb grid h-[132px] w-[132px] place-items-center rounded-full">
                <Robot size={112} src={displayImage} glow={false} float={isLive} />
              </span>
            </div>

            <h3 className="text-[20px] font-extrabold">{profile.title}</h3>
            <p className="mt-1 text-[14px] text-[#64748b]">
              {isLive ? "Voice line is active. Say hello!" : "Connecting to AI voice agent…"}
            </p>

            <div className="vf-eq vf-eq-lg mt-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <span key={index} className={isLive ? "" : "vf-eq-soft"} />
              ))}
            </div>

            {!isLive && (
              <div className="mt-6 flex w-full flex-col gap-1.5">
                {CALL_STEPS.map((item, index) => {
                  const done = index < activeStep;
                  const active = index === activeStep;
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className={`vf-step ${done ? "vf-step-done" : active ? "vf-step-active" : ""}`}>
                      <span className="vf-step-dot grid h-6 w-6 place-items-center rounded-full">
                        {done ? <Check size={13} strokeWidth={3} /> : <Icon size={13} />}
                      </span>
                      <span className="text-[13.5px] font-semibold">{item.label}</span>
                      {active && <span className="vf-step-spin ml-auto" />}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 flex w-full items-center justify-center gap-4">
              {isLive ? (
                <button
                  className="grid h-14 w-14 place-items-center rounded-full bg-rose-600 text-white shadow-[0_10px_26px_rgba(225,29,72,.35)] transition hover:bg-rose-700"
                  onClick={onEnd}
                  aria-label="End call"
                >
                  <PhoneOff size={22} />
                </button>
              ) : (
                <button className="vf-btn vf-btn-ghost w-full px-4 py-3" onClick={onClose}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Booking({ profile, agent, onBack, onChat }) {
  const [day, setDay] = useState(1);
  const [time, setTime] = useState("");
  const [mode, setMode] = useState("Online");
  const [form, setForm] = useState({ name: "", phoneNumber: "", requirement: "" });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const days = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 7 }).map((_, index) => {
      const d = new Date(base);
      d.setDate(base.getDate() + index);
      return {
        label: index === 0 ? "Today" : index === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        dow: index === 0 ? "TODAY" : d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),
        day: d.getDate(),
        mon: d.toLocaleDateString(undefined, { month: "short" }),
        value: toDateInputValue(d)
      };
    });
  }, []);

  const valid = time && form.name.trim() && form.phoneNumber.trim().length >= 6;

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      await api(`/public/agents/${agent._id}/appointments`, {
        method: "POST",
        auth: false,
        body: {
          ...form,
          date: days[day].value,
          time: slotToTimeValue(time),
          timezone: defaultTimezone(),
          mode,
          requirement: form.requirement || `${mode} counselling appointment`,
          appointmentType: mode === "In-person" ? "meeting" : "consultation"
        }
      });
      setDone(true);
      triggerRobotReaction();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="vf-enter grid w-full place-items-center px-4 py-7 sm:px-5">
        <div className="vf-glass flex w-full max-w-[520px] flex-col items-center rounded-[28px] px-7 py-9 text-center sm:px-11">
          <Robot size={130} src={profile.agentImageUrl} glow float />
          <span className="-mt-3 grid h-12 w-12 place-items-center rounded-full bg-[#2563eb] text-white shadow-[0_10px_22px_rgba(37,99,235,.20)]">
            <Check size={24} strokeWidth={3} />
          </span>
          <h1 className="mt-4 text-[27px] font-extrabold tracking-normal">You're booked!</h1>
          <p className="mt-2 text-[15px] text-[#64748b]">Your appointment is saved for {form.name.split(" ")[0] || "you"}.</p>
          <div className="vf-card-solid mt-6 w-full rounded-[18px] px-5 py-1 text-left">
            <InfoRow icon={CalendarDays} label="Date" value={days[day].label} first />
            <InfoRow icon={Clock} label="Time" value={time} />
            <InfoRow icon={MapPin} label="Mode" value={mode} />
            <InfoRow icon={User} label="Advisor" value="Senior Counsellor" />
          </div>
          <div className="mt-6 flex w-full gap-3">
            <button className="vf-btn vf-btn-ghost flex-1 p-3" onClick={onChat}><MessageCircle size={17} /> Ask</button>
            <button className="vf-btn vf-btn-ghost flex-1 p-3" onClick={onBack}><ArrowLeft size={17} /> Home</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vf-enter grid w-full place-items-center px-4 py-5 sm:px-5 sm:py-7">
      <div className="vf-glass w-full max-w-[620px] rounded-[26px] p-[clamp(22px,3.5vw,34px)]">
        <div className="mb-1 flex items-center gap-3">
          <button className="vf-btn vf-btn-ghost p-2.5" onClick={onBack} aria-label="Back"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-[22px] font-extrabold tracking-normal">Book a counselling session</h1>
            <p className="text-[13.5px] text-[#64748b]">Free 1-on-1 with an advisor at {profile.businessName}</p>
          </div>
        </div>
        {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}

        <Picker title="SELECT A DATE">
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {days.map((item, index) => {
              const active = index === day;
              return (
                <button key={item.label} onClick={() => setDay(index)} className={`vf-slot flex h-[76px] w-16 flex-none flex-col items-center justify-center rounded-2xl ${active ? "bg-[#2563eb] text-white shadow-[0_10px_22px_rgba(37,99,235,.20)]" : "border border-[#d8e4f5] bg-[#ffffff]"}`}>
                  <span className="text-[11px] font-semibold opacity-80">{item.dow}</span>
                  <span className="mt-1 text-xl font-extrabold leading-none">{item.day}</span>
                  <span className="mt-0.5 text-[10.5px] opacity-75">{item.mon}</span>
                </button>
              );
            })}
          </div>
        </Picker>

        <Picker title="AVAILABLE SLOTS">
          <div className="flex flex-wrap gap-2.5">
            {slots.map((item) => (
              <button key={item} onClick={() => setTime(item)} className={`vf-slot rounded-xl px-4 py-2.5 text-sm font-bold ${item === time ? "bg-[#dbeafe] text-[#1d4ed8] ring-2 ring-[#2563eb]" : "border border-[#d8e4f5] bg-[#ffffff]"}`}>{item}</button>
            ))}
          </div>
        </Picker>

        <Picker title="MODE">
          <div className="flex gap-2.5">
            {["Online", "In-person"].map((item) => (
              <button key={item} onClick={() => setMode(item)} className={`vf-slot flex flex-1 items-center justify-center gap-2 rounded-xl p-3 text-sm font-bold ${item === mode ? "bg-[#dbeafe] text-[#1d4ed8] ring-2 ring-[#2563eb]" : "border border-[#d8e4f5] bg-[#ffffff]"}`}>
                <MapPin size={16} /> {item}
              </button>
            ))}
          </div>
        </Picker>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Your name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="e.g. Aarav Sharma" />
          <Field label="Phone number" value={form.phoneNumber} onChange={(value) => setForm((current) => ({ ...current, phoneNumber: value }))} placeholder="+91 98765 43210" />
        </div>
        <div className="mt-4">
          <Field label="Requirement" value={form.requirement} onChange={(value) => setForm((current) => ({ ...current, requirement: value }))} placeholder="Course, class, exam or question" />
        </div>

        <button className="vf-btn vf-btn-primary mt-7 w-full p-4" disabled={!valid || saving} onClick={submit}>
          {saving ? "Confirming..." : "Confirm booking"} <ArrowRight size={18} className="ml-auto" />
        </button>
        {!valid && <p className="mt-2.5 text-center text-[12.5px] text-[#64748b]">Pick a slot and add your details to confirm.</p>}
      </div>
    </div>
  );
}

function CategoryTile({ cat, onClick }) {
  const accent = cat.color || "#2563EB";
  return (
    <button onClick={() => onClick(cat)} className="vf-card-solid vf-tile group flex h-full min-h-[176px] flex-col rounded-[20px] p-5 text-left">
      <span
        className="vf-tile-orb mb-4 grid h-[52px] w-[52px] flex-none place-items-center overflow-hidden rounded-2xl"
        style={{ background: `linear-gradient(140deg, ${accent}22, ${accent}12)`, color: accent }}
      >
        <TopicIcon topic={cat} size={23} />
      </span>
      <span className="text-[16px] font-extrabold leading-tight tracking-tight">{cat.title}</span>
      <span className="vf-muted mt-1.5 text-[13px] leading-snug">{cat.description}</span>
      <span className="vf-tile-arrow mt-auto inline-flex items-center gap-1 pt-4 text-[13px] font-bold" style={{ color: accent }}>
        Ask <ArrowRight size={15} />
      </span>
    </button>
  );
}

function TopicIcon({ topic, size = 20 }) {
  const Icon = topicIconMap[topic.icon] || MessageCircle;
  if (topic.iconType === "image" && topic.iconImageUrl) {
    return <img className="h-full w-full object-cover" src={assetUrl(topic.iconImageUrl)} alt="" />;
  }
  if (topic.iconType === "emoji") {
    return <span style={{ fontSize: Math.max(16, size) }}>{topic.icon || "💬"}</span>;
  }
  return <Icon size={size} strokeWidth={2.1} />;
}

function InfoRow({ icon: Icon, label, value, dot, first }) {
  return (
    <div className={`vf-info-row flex items-center gap-3.5 px-3 py-3 ${first ? "" : "vf-info-row-div"}`}>
      <span className="vf-icon-orb h-[38px] w-[38px] flex-none rounded-xl">{dot ? <GreenDot /> : <Icon size={18} />}</span>
      <span className="vf-muted text-[14px] font-medium">{label}</span>
      <span className="ml-auto text-right text-[14.5px] font-bold">{value}</span>
    </div>
  );
}

function Bubble({ message, profile }) {
  const isUser = message.role === "user";
  const avatarImage = profile?.agentImageUrl || profile?.logoUrl;

  return (
    <div className={`vf-msg flex items-end gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <Robot size={34} src={avatarImage} glow={false} float={false} />}

      <div className={`${isUser ? "rounded-br-md bg-[#2563eb] text-white" : "vf-card-solid rounded-bl-md"} max-w-[78%] rounded-[18px] px-4 py-3 text-[15px] leading-normal ${message.error ? "text-rose-700" : ""}`}>
        {message.text}
      </div>
    </div>
  );
}

function TypingBubble({ profile }) {
  const avatarImage = profile?.agentImageUrl || profile?.logoUrl;

  return (
    <div className="vf-msg flex items-end gap-2.5">
      <Robot size={34} src={avatarImage} glow={false} float={false} />

      <div className="vf-card-solid vf-typing flex items-center gap-1.5 rounded-[18px] rounded-bl-md px-4 py-3.5">
        <span /><span /><span />
      </div>
    </div>
  );
}

function Picker({ title, children }) {
  return (
    <div className="mt-5">
      <div className="mb-2.5 text-[13px] font-bold text-[#64748b]">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-bold text-[#64748b]">{label}</span>
      <input className="vf-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function AiPill({ onDark = false }) {
  return (
    <span className={`vf-ai-pill ${onDark ? "vf-ai-pill-dark" : ""} inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-extrabold`}>
      <span className="vf-ai-pill-orb grid h-6 w-6 place-items-center rounded-full"><Sparkles size={15} /></span>
      AI Assistant
    </span>
  );
}

function GreenDot() {
  return (
    <span className="relative inline-grid h-[11px] w-[11px] place-items-center">
      <span className="absolute inset-0 animate-[vfPulseRing_2s_ease-out_infinite] rounded-full bg-emerald-500/35" />
      <span className="h-[11px] w-[11px] rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,.6)]" />
    </span>
  );
}

function Robot({ size = 240, src = "", head = false, glow = true, float = true }) {
  const fallback = head ? robotHead : robotImage;
  const [imageSrc, setImageSrc] = useState(src || fallback);

  useEffect(() => {
    setImageSrc(src || fallback);
  }, [src, fallback]);

  return (
    <span className="vf-robot-wrap" style={{ width: size, height: size }}>
      {glow && <span className="vf-robot-glow" />}

      <img
        className={`vf-robot-img ${float ? "vf-robot-float" : ""}`}
        src={imageSrc}
        alt="AI assistant"
        draggable="false"
        onError={() => setImageSrc(fallback)}
      />
    </span>
  );
}

const themeCss = `
.vf-theme{--accent:#2563eb;--accent-d:#1d4ed8;--accent-soft:#dbeafe;--accent-tint:rgba(37,99,235,.14);--btn:#2563eb;--btn-d:#1d4ed8;--btn-ink:#fff;--bg:#f8fafc;--bg-2:#eef2f8;--panel:#ffffff;--panel-soft:rgba(37,99,235,.05);--line:#e2e8f0;--text:#0f172a;--muted:#64748b;--radius:18px;--button-radius:14px;--heading-font:"App Body Manrope","App Body Inter",ui-sans-serif,system-ui,sans-serif;--body-font:"App Body Inter",ui-sans-serif,system-ui,sans-serif;--heading-weight:800;--heading-tracking:-0.02em;--body-size:15.5px;--content-max:1080px;--shadow:0 12px 32px rgba(15,23,42,.08);--cardline:var(--line);font-family:var(--body-font);font-size:var(--body-size);color:var(--text);background:var(--bg);overflow-x:hidden}
.vf-theme h1,.vf-theme h2,.vf-theme h3,.vf-theme h4,.vf-theme h5,.vf-theme h6{font-family:var(--heading-font);font-weight:var(--heading-weight);letter-spacing:var(--heading-tracking)}
.vf-theme *{overflow-wrap:anywhere}
.vf-muted{color:var(--muted)}
.vf-accent-ink{color:var(--accent-d)}
.vf-public-page{min-height:100vh;background:linear-gradient(135deg,#f8f9ff 0%,#f5f4ff 48%,#fafaff 100%)!important;color:#11163d;--accent:#4f46e5;--accent-d:#3730a3;--accent-soft:#ede9fe;--accent-tint:rgba(79,70,229,.16);--btn:#4f46e5;--btn-d:#4338ca;--text:#11163d;--muted:#626985;--line:#e3e7f5;--panel:#fff;--radius:24px;--button-radius:16px;--content-max:1560px;--shadow:0 18px 45px rgba(42,36,116,.10);font-family:"App Body Inter",Inter,ui-sans-serif,system-ui,sans-serif}
.vf-public-page .vf-landing{max-width:min(1560px,calc(100vw - 56px));padding-inline:0}
.vf-public-page button:focus-visible,.vf-public-page a:focus-visible{outline:3px solid rgba(79,70,229,.28);outline-offset:3px}
.vf-public-nav-shell{padding:14px 0 12px;background:linear-gradient(180deg,rgba(248,249,255,.92),rgba(248,249,255,.66));backdrop-filter:blur(16px)}
.vf-public-nav{position:relative;display:flex;min-height:92px;align-items:center;gap:22px;border:1px solid rgba(218,222,242,.82);border-radius:22px;background:rgba(255,255,255,.88);box-shadow:0 18px 45px rgba(34,36,72,.08);padding:16px 24px}
.vf-public-brand{display:flex;min-width:0;align-items:center;gap:14px;text-align:left}
.vf-public-brand-avatar{display:grid;height:54px;width:54px;flex:none;place-items:center;overflow:hidden;border:1px solid rgba(126,111,255,.20);border-radius:16px;background:linear-gradient(145deg,#fff,#eeeaff);box-shadow:inset 0 1px 0 rgba(255,255,255,.86),0 10px 22px rgba(79,70,229,.12)}
.vf-public-brand-copy{display:grid;min-width:0;gap:4px}
.vf-public-brand-title{overflow:hidden;color:#101541;font-size:18px;font-weight:850;line-height:1.1;text-overflow:ellipsis;white-space:nowrap}
.vf-public-brand-sub{display:flex;min-width:0;align-items:center;gap:8px;color:#59617f;font-size:13.5px;font-weight:650}
.vf-public-brand-sub span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vf-public-dot,.vf-public-meta-divider{display:inline-block;height:5px;width:5px;flex:none;border-radius:999px;background:#10b981}
.vf-public-nav-items{position:absolute;left:50%;display:flex;align-items:center;gap:32px;transform:translateX(-50%)}
.vf-public-nav-link{position:relative;display:inline-flex;height:48px;align-items:center;gap:9px;color:#4d5576;font-size:15px;font-weight:800;white-space:nowrap;transition:color .18s ease,transform .18s ease}
.vf-public-nav-link:hover{color:#4f46e5;transform:translateY(-1px)}
.vf-public-nav-link.is-active{color:#4f46e5}
.vf-public-nav-link.is-active::after{position:absolute;right:0;bottom:-15px;left:0;height:3px;border-radius:999px;background:#4f46e5;content:""}
.vf-public-nav-actions{display:flex;align-items:center;gap:10px;margin-left:auto}
.vf-public-back{display:inline-flex;min-height:40px;align-items:center;gap:7px;border:1px solid #e4e7f4;border-radius:999px;background:#fff;padding:0 13px;color:#38405f;font-size:13px;font-weight:800}
.vf-public-online-pill{display:inline-flex;min-height:42px;align-items:center;gap:8px;border:1px solid rgba(16,185,129,.25);border-radius:999px;background:#ecfdf5;padding:0 16px;color:#047857;font-size:14px;font-weight:850;white-space:nowrap}
.vf-public-online-pill.is-offline{border-color:#e5e7eb;background:#f8fafc;color:#64748b}
.vf-public-offline-dot{height:10px;width:10px;border-radius:999px;background:#94a3b8}
.vf-public-menu{display:none;height:42px;width:42px;place-items:center;border:1px solid #e4e7f4;border-radius:14px;background:#fff;color:#3730a3}
.vf-public-mobile-menu{position:absolute;top:calc(100% + 10px);right:14px;left:14px;display:grid;gap:6px;border:1px solid #e4e7f4;border-radius:18px;background:#fff;padding:10px;box-shadow:0 18px 42px rgba(34,36,72,.12)}
.vf-public-mobile-menu button{display:flex;align-items:center;gap:10px;border-radius:13px;padding:12px 13px;color:#11163d;font-weight:800;text-align:left}
.vf-public-mobile-menu button:hover{background:#f3f1ff;color:#4f46e5}
.vf-public-shell{width:100%;max-width:min(1560px,calc(100vw - 56px));margin-inline:auto;padding:18px 0 30px}
.vf-public-hero-card{position:relative;min-height:540px;overflow:hidden;border:1px solid rgba(219,222,245,.92);border-radius:28px;background:linear-gradient(120deg,rgba(255,255,255,.96) 0%,rgba(255,255,255,.88) 46%,rgba(238,234,255,.92) 100%);box-shadow:0 22px 55px rgba(45,42,116,.11)}
.vf-public-hero-grid{position:relative;z-index:1;display:grid;min-height:540px;align-items:center;gap:clamp(46px,5vw,78px);grid-template-columns:minmax(360px,.44fr) minmax(0,.56fr);padding:clamp(54px,4.8vw,72px)}
.vf-public-hero-decor,.vf-public-hero-decor span{pointer-events:none;position:absolute}
.vf-public-dots{width:104px;height:104px;background-image:radial-gradient(circle,rgba(79,70,229,.20) 2px,transparent 2.4px);background-size:20px 20px;opacity:.35}
.vf-public-dots-a{top:24px;left:28px}.vf-public-dots-b{right:42px;bottom:48px}
.vf-public-ring{border:4px solid rgba(255,255,255,.72);border-radius:999px;opacity:.75}
.vf-public-ring-a{right:-46px;top:168px;width:168px;height:168px}.vf-public-ring-b{left:-54px;bottom:84px;width:126px;height:126px}
.vf-public-glow{border-radius:999px;filter:blur(34px);opacity:.65}
.vf-public-glow-a{top:-90px;right:18%;width:300px;height:240px;background:rgba(167,139,250,.26)}
.vf-public-glow-b{bottom:-90px;left:18%;width:320px;height:230px;background:rgba(196,181,253,.23)}
.vf-public-curve{right:5%;bottom:15%;width:44%;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);transform:rotate(-12deg)}
.vf-public-visual{position:relative;display:grid;min-height:430px;place-items:center}
.vf-public-visual-ring{position:relative;display:grid;width:min(440px,100%);aspect-ratio:1;place-items:center;border-radius:999px;background:radial-gradient(circle at 46% 48%,#f9f8ff 0 45%,rgba(220,214,255,.70) 46% 63%,rgba(220,214,255,.28) 64% 100%);box-shadow:inset 0 0 0 24px rgba(255,255,255,.42),0 28px 60px rgba(79,70,229,.13)}
.vf-public-visual-inner{display:grid;width:82%;height:82%;place-items:center;border-radius:999px;background:radial-gradient(circle at 50% 38%,rgba(255,255,255,.92),rgba(255,255,255,.42) 66%,transparent 68%)}
.vf-public-visual .vf-robot-wrap{max-width:100%;max-height:100%}
.vf-public-bot-placeholder{display:grid;width:70%;height:70%;place-items:center;border-radius:999px;background:linear-gradient(145deg,#4f46e5,#a78bfa);color:#fff;box-shadow:0 26px 48px rgba(79,70,229,.22)}
.vf-public-float-badge{position:absolute;z-index:2;display:grid;height:76px;width:76px;place-items:center;border:1px solid rgba(225,226,246,.95);border-radius:999px;background:rgba(255,255,255,.88);box-shadow:0 18px 38px rgba(45,42,116,.10);color:#4f46e5;animation:vfPublicFloat 5.2s ease-in-out infinite}
.vf-public-float-badge.is-message{top:44px;left:8%}.vf-public-float-badge.is-zap{top:44px;right:7%;animation-delay:.7s}.vf-public-float-badge.is-headphones{bottom:54px;left:9%;animation-delay:1.1s}.vf-public-float-badge.is-wave{right:8%;bottom:54px;animation-delay:1.6s}
.vf-public-info{display:flex;min-width:0;flex-direction:column;align-items:flex-start}
.vf-public-title{margin-top:22px;max-width:760px;color:#11163d;font-size:clamp(46px,4.8vw,68px);font-weight:850;line-height:1.07;letter-spacing:0;overflow-wrap:normal}
.vf-public-description{margin-top:18px;max-width:680px;color:#626985;font-size:clamp(17px,1.4vw,20px);font-weight:560;line-height:1.55}
.vf-public-pills{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}
.vf-public-status-pill{display:inline-flex;min-height:38px;align-items:center;gap:8px;border:1px solid rgba(221,225,243,.92);border-radius:999px;background:rgba(255,255,255,.82);box-shadow:0 8px 20px rgba(45,42,116,.07);color:#58617f;padding:0 16px;font-size:14px;font-weight:800}
.vf-public-status-pill svg{color:#4f46e5}.vf-public-status-pill.is-green{color:#047857}
.vf-public-actions{display:grid;width:min(100%,560px);gap:16px;margin-top:28px}
.vf-public-primary-action{display:grid;min-height:64px;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;border-radius:16px;background:linear-gradient(135deg,#4f46e5,#4338ca);box-shadow:0 18px 34px rgba(67,56,202,.28);color:#fff;padding:0 24px;font-size:18px;font-weight:900;text-align:left;transition:transform .18s ease,box-shadow .2s ease,filter .2s ease}
.vf-public-primary-action:hover{transform:translateY(-2px);box-shadow:0 24px 42px rgba(67,56,202,.34);filter:saturate(1.08)}
.vf-public-secondary-actions{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}
.vf-public-secondary-action{display:inline-flex;min-height:60px;align-items:center;justify-content:center;gap:11px;border-radius:15px;font-size:17px;font-weight:900;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}
.vf-public-secondary-action:hover{transform:translateY(-1px)}
.vf-public-secondary-action.is-booking{border:1px solid #e1e5f2;background:#fff;color:#11163d;box-shadow:0 10px 24px rgba(45,42,116,.07)}
.vf-public-secondary-action.is-voice{border:1px solid rgba(79,70,229,.18);background:#eef2ff;color:#4338ca;box-shadow:inset 0 1px 0 rgba(255,255,255,.72)}
.vf-public-meta{display:flex;max-width:760px;flex-wrap:wrap;align-items:center;gap:12px;margin-top:28px;color:#68708b;font-size:15px;font-weight:800}
.vf-public-meta span:not(.vf-public-meta-divider){display:inline-flex;align-items:center;gap:9px}
.vf-public-meta svg{color:#4f46e5}.vf-public-meta-divider{background:#c7cbe0}
.vf-public-features{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:30px}
.vf-public-feature-card{display:flex;min-height:120px;align-items:center;gap:22px;border:1px solid rgba(221,225,243,.9);border-radius:20px;background:rgba(255,255,255,.88);box-shadow:0 14px 34px rgba(45,42,116,.08);padding:24px 26px;transition:transform .18s ease,box-shadow .2s ease,border-color .18s ease}
.vf-public-feature-card:hover{transform:translateY(-3px);border-color:rgba(79,70,229,.20);box-shadow:0 20px 42px rgba(45,42,116,.11)}
.vf-public-feature-icon{display:grid;height:62px;width:62px;flex:none;place-items:center;border-radius:999px;color:#fff;box-shadow:0 12px 26px rgba(45,42,116,.14)}
.vf-public-feature-icon.is-purple{background:linear-gradient(145deg,#8b5cf6,#4f46e5)}.vf-public-feature-icon.is-green{background:linear-gradient(145deg,#34d399,#059669)}.vf-public-feature-icon.is-blue{background:linear-gradient(145deg,#60a5fa,#2563eb)}.vf-public-feature-icon.is-orange{background:linear-gradient(145deg,#fbbf24,#f97316)}
.vf-public-feature-copy{display:grid;gap:6px;min-width:0}.vf-public-feature-copy strong{color:#11163d;font-size:18px;font-weight:900;line-height:1.12}.vf-public-feature-copy span{color:#51607d;font-size:15px;font-weight:560;line-height:1.45}
.vf-public-social{display:flex;justify-content:center;margin-top:28px}
@keyframes vfPublicFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
/* Background treatments (one wins per template via the extra class on .vf-theme) */
.vf-theme.vf-bg-clean_white,.vf-theme.vf-bg-solid,.vf-theme.vf-bg-cover_image{background:var(--bg)}
.vf-theme.vf-bg-soft_gradient{background:radial-gradient(circle at 6% -4%,var(--accent-tint),transparent 30%),radial-gradient(circle at 98% 0%,var(--accent-tint),transparent 34%),var(--bg)}
.vf-theme.vf-bg-gradient_mesh{background:radial-gradient(42% 42% at 10% 6%,var(--accent-tint),transparent 60%),radial-gradient(46% 46% at 94% 0%,color-mix(in srgb,var(--accent) 18%,transparent),transparent 62%),radial-gradient(44% 52% at 80% 104%,var(--accent-tint),transparent 60%),var(--bg)}
.vf-theme.vf-bg-warm_gradient{background:radial-gradient(66% 52% at 50% -12%,color-mix(in srgb,var(--accent) 18%,transparent),transparent 62%),var(--bg)}
.vf-theme.vf-bg-radial_glow{background:radial-gradient(60% 48% at 50% 0%,var(--accent-tint),transparent 60%),var(--bg)}
/* Card shadow + border scales */
.vf-shadow-none{--shadow:none}.vf-shadow-soft{--shadow:0 8px 24px rgba(15,23,42,.07)}.vf-shadow-medium{--shadow:0 12px 32px rgba(15,23,42,.10)}.vf-shadow-elevated{--shadow:0 22px 50px rgba(15,23,42,.16)}.vf-shadow-glow{--shadow:0 18px 44px var(--accent-tint)}
.vf-border-none{--cardline:transparent}.vf-border-subtle{--cardline:var(--line)}.vf-border-strong{--cardline:color-mix(in srgb,var(--text) 18%,transparent)}
/* Spacing scale — uniform vertical rhythm for the landing block */
.vf-space-compact .vf-landing{padding-block:28px}.vf-space-cozy .vf-landing{padding-block:40px}.vf-space-comfortable .vf-landing{padding-block:52px}.vf-space-spacious .vf-landing{padding-block:68px}
.vf-landing{width:100%;max-width:var(--content-max);margin-inline:auto}
.vf-landing-narrow{max-width:min(var(--content-max),720px)}
.vf-landing-mid{max-width:min(var(--content-max),720px)}
.vf-h1{font-size:clamp(30px,5vw,50px);line-height:1.06}
.vf-h1-lg{font-size:clamp(34px,5.6vw,58px)}
.vf-sub{color:var(--muted);font-size:clamp(15px,2.2vw,17px);line-height:1.6;max-width:58ch}
.vf-glass{background:color-mix(in srgb,var(--panel) 90%,transparent);border:1px solid color-mix(in srgb,var(--cardline) 82%,white);box-shadow:var(--shadow);backdrop-filter:blur(16px)}
.vf-card-solid{background:var(--panel);border:1px solid var(--cardline);box-shadow:var(--shadow)}
.vf-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:var(--button-radius);font-weight:800;white-space:nowrap;transition:transform .1s,background .15s,box-shadow .2s,border-color .15s,color .15s}
.vf-btn:active{transform:translateY(1px)}.vf-btn:disabled{opacity:.5;cursor:not-allowed}
.vf-btn-primary{background:var(--btn);color:var(--btn-ink);box-shadow:0 10px 24px var(--accent-tint)}.vf-btn-primary:hover{background:var(--btn-d)}
.vf-btn-ghost{background:var(--panel);color:var(--text);border:1px solid var(--line);box-shadow:0 6px 18px rgba(15,23,42,.06)}.vf-btn-ghost:hover{border-color:var(--accent);color:var(--accent-d)}
.vf-btn-soft{background:var(--accent-soft);color:var(--accent-d);border:1px solid color-mix(in srgb,var(--accent) 28%,var(--accent-soft))}.vf-btn-soft:hover{background:color-mix(in srgb,var(--accent) 18%,var(--accent-soft))}
.vf-icon-orb{display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-d);flex:none}
.vf-tile{transition:transform .16s,box-shadow .2s,border-color .16s}.vf-tile:hover{transform:translateY(-2px);box-shadow:var(--shadow);border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}
.vf-slot{transition:transform .1s,box-shadow .18s,border-color .15s}.vf-slot:active{transform:translateY(1px)}
.vf-input{width:100%;border-radius:13px;border:1px solid var(--line);background:color-mix(in srgb,var(--bg) 70%,var(--panel));padding:12px 14px;font-size:15px;color:var(--text);outline:none}.vf-input::placeholder{color:var(--muted)}.vf-input:focus{border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-tint)}
.vf-robot-wrap{position:relative;display:grid;place-items:center;flex:none}.vf-robot-glow{position:absolute;inset:12%;border-radius:999px;background:radial-gradient(circle,var(--accent-tint),transparent 62%);filter:blur(6px)}
.vf-robot-img{position:relative;z-index:1;width:100%;height:100%;object-fit:contain;user-select:none;filter:drop-shadow(0 18px 28px var(--accent-tint))}
.vf-robot-float{animation:vfFloat 4s ease-in-out infinite}.vf-robot-react{animation:vfReact .55s ease}
.vf-enter{animation:vfViewIn .4s cubic-bezier(.2,.75,.25,1)}
.vf-topbar{border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--panel) 82%,transparent);backdrop-filter:blur(14px)}
.vf-scroll{scrollbar-width:thin;scrollbar-color:var(--accent-soft) transparent}.vf-scroll::-webkit-scrollbar{width:9px}.vf-scroll::-webkit-scrollbar-thumb{background:var(--accent-soft);border-radius:99px}
.vf-typing span{width:6px;height:6px;border-radius:999px;background:var(--accent);animation:vfTyping 1s infinite}.vf-typing span:nth-child(2){animation-delay:.14s}.vf-typing span:nth-child(3){animation-delay:.28s}
.vf-pulse-ring{position:absolute;inset:28px;border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:999px;animation:vfPulseScale 2s ease-out infinite}.vf-pulse-ring.vf-d2{animation-delay:.45s}.vf-pulse-ring.vf-d3{animation-delay:.9s}
.vf-eq{display:flex;align-items:center;justify-content:center;gap:5px;height:38px}.vf-eq span{width:6px;border-radius:99px;background:var(--accent);animation:vfEq .9s ease-in-out infinite}.vf-eq span:nth-child(odd){height:24px}.vf-eq span:nth-child(even){height:34px;animation-delay:.16s}
.vf-eq-lg{height:44px;gap:6px}.vf-eq-lg span{width:7px}.vf-eq-soft{opacity:.5;animation-duration:1.4s}
.vf-avatar-frame{display:grid;place-items:center;background:linear-gradient(150deg,color-mix(in srgb,var(--accent) 12%,var(--panel)),var(--accent-soft));border:1px solid color-mix(in srgb,var(--accent) 22%,var(--line));overflow:hidden}
.vf-chip{background:var(--panel);border:1px solid var(--line);color:var(--muted);box-shadow:0 2px 8px rgba(15,23,42,.05)}
.vf-ai-pill{background:color-mix(in srgb,var(--panel) 88%,transparent);border:1px solid var(--line);color:var(--accent-d);box-shadow:0 6px 18px rgba(15,23,42,.06)}
.vf-ai-pill-orb{display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-d)}
.vf-ai-pill-dark{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff}.vf-ai-pill-dark .vf-ai-pill-orb{background:rgba(255,255,255,.22);color:#fff}
.vf-hero-visual{position:relative;background:linear-gradient(165deg,var(--panel),color-mix(in srgb,var(--accent) 12%,var(--panel)) 60%,var(--accent-soft));border:1px solid color-mix(in srgb,var(--accent) 20%,var(--line));box-shadow:var(--shadow)}
.vf-hero-visual::before{content:"";position:absolute;inset:0;border-radius:inherit;background:radial-gradient(120px 120px at 30% 22%,color-mix(in srgb,var(--panel) 80%,transparent),transparent 60%);pointer-events:none}
.vf-advisor-visual{position:relative;background:radial-gradient(circle at 50% 28%,var(--accent-soft),transparent 62%),linear-gradient(165deg,var(--panel),color-mix(in srgb,var(--accent) 10%,var(--panel)));border:1px solid color-mix(in srgb,var(--accent) 18%,var(--line));box-shadow:var(--shadow)}
.vf-agent-card{overflow:hidden}
.vf-info-flat{background:color-mix(in srgb,var(--panel) 55%,transparent);border:1px solid var(--line)}
.vf-info-row-div{border-top:1px solid color-mix(in srgb,var(--line) 72%,transparent)}
.vf-inline-stat{display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-size:13.5px;font-weight:700}.vf-inline-stat svg{color:var(--accent-d)}
.vf-inline-dot{width:4px;height:4px;border-radius:999px;background:var(--muted);opacity:.5}
.vf-badge{background:var(--panel);border:1px solid var(--line);box-shadow:var(--shadow)}
.vf-social-btn{background:var(--panel);border:1px solid var(--line);color:var(--accent-d);box-shadow:0 4px 12px rgba(15,23,42,.06);transition:transform .15s,border-color .15s,background .15s}.vf-social-btn:hover{transform:translateY(-2px);border-color:var(--accent);background:var(--accent-soft)}
.vf-cover-banner{position:relative;min-height:180px;display:flex;align-items:flex-end;background-size:cover;background-position:center;background-color:color-mix(in srgb,var(--accent) 22%,var(--panel));border:1px solid var(--line);overflow:hidden}
.vf-cover-banner::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,14,25,.05),rgba(10,14,25,.55))}
.vf-cover-banner-body{position:relative;z-index:1;display:flex;align-items:center;gap:14px;padding:18px 20px;width:100%}
.vf-cover-title{color:#fff;font-size:clamp(22px,3.4vw,32px);line-height:1.1}
.vf-cover-sub{color:rgba(255,255,255,.86);font-size:13.5px;font-weight:700}
.vf-cover-hero{position:relative;min-height:clamp(360px,52vh,460px);display:flex;align-items:center;background-size:cover;background-position:center;background-color:#1a2436;border:1px solid var(--line);overflow:hidden}
.vf-cover-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,rgba(6,10,20,.84),rgba(6,10,20,.32))}
.vf-cover-hero-inner{position:relative;z-index:1;width:100%;padding:clamp(24px,5vw,56px)}
.vf-reserve-panel{background:color-mix(in srgb,var(--accent) 8%,var(--panel));border:1px dashed color-mix(in srgb,var(--accent) 42%,var(--line));box-shadow:var(--shadow)}
.vf-reserve-meta{color:var(--muted)}
.vf-soft-tile{background:var(--panel);border:1px solid var(--line);box-shadow:var(--shadow)}
.vf-finance-panel{overflow:hidden}
.vf-check{background:color-mix(in srgb,var(--btn) 16%,var(--panel));color:var(--btn)}
.vf-cta{height:56px;border-radius:var(--button-radius);font-size:15.5px;padding-inline:20px}
.vf-cta-sec{height:52px;border-radius:var(--button-radius);padding-inline:16px}
.vf-tile-orb{transition:transform .18s}.vf-tile:hover .vf-tile-orb{transform:scale(1.06)}
.vf-tile-arrow{opacity:.75;transition:opacity .18s,transform .18s}.vf-tile:hover .vf-tile-arrow{opacity:1;transform:translateX(2px)}
.vf-modal-overlay{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.55);backdrop-filter:blur(6px);animation:vfFadeIn .25s ease}
.vf-modal{position:relative;width:100%;max-width:400px;border-radius:28px;background:color-mix(in srgb,var(--panel) 98%,transparent);border:1px solid var(--line);box-shadow:0 30px 80px rgba(15,23,42,.28);padding:26px 24px;color:var(--text)}
.vf-modal-in{animation:vfModalIn .34s cubic-bezier(.2,.8,.24,1)}
.vf-modal-x{position:absolute;top:14px;right:14px;display:grid;place-items:center;height:34px;width:34px;border-radius:12px;color:var(--muted);background:color-mix(in srgb,var(--bg) 70%,var(--panel));transition:background .15s,color .15s}.vf-modal-x:hover{background:var(--bg-2);color:var(--text)}
.vf-call-orb{background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 10%,var(--panel)),var(--accent-soft));border:1px solid color-mix(in srgb,var(--accent) 24%,var(--line));box-shadow:inset 0 2px 10px rgba(255,255,255,.7),0 12px 30px var(--accent-tint)}
.vf-step{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;color:var(--muted);background:color-mix(in srgb,var(--bg) 70%,var(--panel));border:1px solid transparent;transition:all .2s}
.vf-step-dot{background:var(--bg-2);color:var(--muted);flex:none;transition:all .2s}
.vf-step-active{color:var(--accent-d);background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 26%,var(--line))}.vf-step-active .vf-step-dot{background:var(--accent-soft);color:var(--accent-d)}
.vf-step-done{color:var(--text)}.vf-step-done .vf-step-dot{background:#22c55e;color:#fff}
.vf-step-spin{height:15px;width:15px;border-radius:999px;border:2px solid var(--accent-soft);border-top-color:var(--accent);animation:vfSpin .7s linear infinite}
/* Entrance / motion tokens (more specific selector wins over .vf-enter default) */
.vf-anim-none .vf-enter{animation:none}
.vf-anim-fade_in .vf-enter{animation:vfFadeIn .5s ease}
.vf-anim-slide_up .vf-enter{animation:vfViewIn .45s cubic-bezier(.2,.75,.25,1)}
.vf-anim-zoom_in .vf-enter{animation:vfZoomIn .45s cubic-bezier(.2,.8,.24,1)}
.vf-anim-floating_cards .vf-enter{animation:vfFadeIn .5s ease}.vf-anim-floating_cards .vf-tile,.vf-anim-floating_cards .vf-badge{animation:vfFloat 5s ease-in-out infinite}
.vf-anim-pulse_button .vf-btn-primary{animation:vfPulseBtn 2.6s ease-in-out infinite}
.vf-anim-gradient_motion .vf-hero-visual,.vf-anim-gradient_motion .vf-advisor-visual{background-size:180% 180%;animation:vfGradientShift 9s ease infinite}
@keyframes vfFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes vfReact{0%,100%{transform:translateY(0) rotate(0)}35%{transform:translateY(-6px) rotate(-2deg)}70%{transform:translateY(2px) rotate(2deg)}}@keyframes vfViewIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@keyframes vfZoomIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}@keyframes vfPulseRing{from{transform:scale(.6);opacity:.8}to{transform:scale(2.3);opacity:0}}@keyframes vfTyping{0%,80%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}@keyframes vfPulseScale{from{transform:scale(.7);opacity:.7}to{transform:scale(1.35);opacity:0}}@keyframes vfEq{0%,100%{transform:scaleY(.5)}50%{transform:scaleY(1.15)}}
@keyframes vfPulseBtn{0%,100%{box-shadow:0 10px 24px var(--accent-tint)}50%{box-shadow:0 12px 30px color-mix(in srgb,var(--accent) 40%,transparent)}}
@keyframes vfGradientShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes vfSpin{to{transform:rotate(360deg)}}
@keyframes vfFadeIn{from{opacity:0}to{opacity:1}}
@keyframes vfModalIn{from{opacity:0;transform:translateY(16px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}
@media (max-width:1280px){.vf-public-nav-items{gap:18px}.vf-public-nav-link{font-size:14px}.vf-public-hero-grid{grid-template-columns:minmax(320px,.42fr) minmax(0,.58fr);padding:44px}.vf-public-visual-ring{width:min(380px,100%)}.vf-public-float-badge{height:66px;width:66px}.vf-public-features{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:1024px){.vf-public-page .vf-landing,.vf-public-shell{max-width:calc(100vw - 40px)}.vf-public-nav{min-height:82px;padding:14px 16px}.vf-public-nav-items{display:none}.vf-public-menu{display:grid}.vf-public-hero-grid{gap:28px;grid-template-columns:minmax(280px,.48fr) minmax(0,.52fr);padding:36px}.vf-public-title{font-size:clamp(40px,5.2vw,52px)}.vf-public-description{font-size:17px}.vf-public-actions{width:100%}}
@media (max-width:780px){.vf-public-page .vf-landing,.vf-public-shell{max-width:calc(100vw - 28px)}.vf-public-nav-shell{padding-top:10px}.vf-public-nav{border-radius:18px}.vf-public-brand-avatar{height:48px;width:48px}.vf-public-brand-title{font-size:16px}.vf-public-brand-sub{font-size:12.5px}.vf-public-online-pill{display:none}.vf-public-hero-card{border-radius:24px}.vf-public-hero-grid{min-height:auto;grid-template-columns:1fr;padding:28px 22px 30px}.vf-public-visual{min-height:330px;order:-1}.vf-public-visual-ring{width:min(330px,88vw)}.vf-public-visual-inner .vf-robot-wrap{width:280px!important;height:280px!important}.vf-public-float-badge{height:56px;width:56px}.vf-public-float-badge svg{width:22px;height:22px}.vf-public-info{align-items:center;text-align:center}.vf-public-title{font-size:clamp(34px,9vw,42px);line-height:1.1}.vf-public-description{font-size:16px}.vf-public-pills{justify-content:center}.vf-public-secondary-actions{grid-template-columns:1fr}.vf-public-meta{justify-content:center;font-size:14px}.vf-public-features{grid-template-columns:1fr;gap:14px;margin-top:22px}.vf-public-feature-card{min-height:104px;padding:20px}.vf-public-hero-decor .vf-public-dots-b,.vf-public-ring-a,.vf-public-curve{display:none}}
@media (max-width:640px){.vf-cover-hero{min-height:340px}}
@media (max-width:480px){.vf-public-brand-sub svg,.vf-public-brand-sub .vf-public-dot,.vf-public-brand-sub span:last-child{display:none}.vf-public-shell{padding-top:10px}.vf-public-hero-grid{padding:24px 18px}.vf-public-visual{min-height:280px}.vf-public-visual-ring{width:min(280px,86vw)}.vf-public-visual-inner .vf-robot-wrap{width:230px!important;height:230px!important}.vf-public-float-badge{height:48px;width:48px}.vf-public-float-badge.is-message{left:0;top:28px}.vf-public-float-badge.is-zap{right:0;top:28px}.vf-public-float-badge.is-headphones{left:2%;bottom:34px}.vf-public-float-badge.is-wave{right:2%;bottom:34px}.vf-public-primary-action{min-height:58px;padding:0 18px;font-size:16px}.vf-public-secondary-action{min-height:56px;font-size:15px}.vf-public-feature-icon{height:54px;width:54px}.vf-public-feature-copy strong{font-size:16px}.vf-public-feature-copy span{font-size:14px}}
@media (prefers-reduced-motion:reduce){.vf-enter,.vf-robot-float,.vf-btn-primary,.vf-hero-visual,.vf-advisor-visual,.vf-tile,.vf-badge,.vf-public-float-badge,.vf-public-primary-action,.vf-public-secondary-action,.vf-public-feature-card{animation:none!important;transition:none!important}}
`;

