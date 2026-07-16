import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  BookOpen,
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
  Instagram,
  Landmark,
  Linkedin,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Utensils,
  User,
  X,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import robotHead from "../assets/voiceflow-theme/robot-head-themed.png";
import robotImage from "../assets/voiceflow-theme/robot-themed.png";
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
  const [callMuted, setCallMuted] = useState(false);
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
  const chatEnabled = Boolean(agent?.publicChatEnabled);
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
    chatEnabled,
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
    setCallMuted(false);
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
    setCallMuted(false);
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
          onCallEnd: () => {
            setCallStatus("ended");
            setCallMuted(false);
          },
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
      setCallMuted(false);
      setCallStatus("ended");
    }
  }

  function handleMuteToggle() {
    const nextMuted = !callMuted;
    try {
      vapiRef.current?.setMuted?.(nextMuted);
    } catch {
      // Some providers may not expose a browser mute control; keep the UI state local.
    }
    setCallMuted(nextMuted);
  }

  if (loading) {
    return (
      <main className="vf-theme vf-public-profile-shell min-h-screen">
        <style>{themeCss}</style>
        <ProfileSkeleton />
      </main>
    );
  }

  if (error && !agent) {
    return (
      <main className="vf-theme vf-public-profile-shell min-h-screen">
        <style>{themeCss}</style>
        <ProfileErrorState message={error} />
      </main>
    );
  }

  return (
    <main
      className={`vf-theme ${view === "landing" ? "vf-public-profile-shell " : "vf-public-dark-shell "}vf-template-${bio.template || "coaching_education"} vf-layout-${layoutVariant} vf-bg-${bio.backgroundStyle || "soft_gradient"} vf-space-${bio.spacingScale || "comfortable"} vf-shadow-${bio.cardShadow || "soft"} vf-border-${bio.cardBorder || "subtle"} vf-anim-${bio.animation || "fade_in"} min-h-screen`}
      style={pageStyle}
    >
      <style>{themeCss}</style>
      {showTopBar && view !== "landing" && <TopBar profile={profile} view={view} showLogo={showLogo} onHome={() => setView("landing")} />}

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
          muted={callMuted}
          error={error}
          onStart={startWebCall}
          onEnd={endWebCall}
          onMuteToggle={handleMuteToggle}
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

function TopBar({ profile, view, showLogo = true, onHome }) {
  return (
    <header className="vf-topbar sticky top-0 z-30">
      <div className="vf-landing flex h-[66px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button onClick={onHome} className="flex min-w-0 items-center gap-3 text-left" aria-label="Home">
          {showLogo && (
            <span className="vf-avatar-frame h-10 w-10 flex-none rounded-xl">
              <Robot size={34} src={profile.agentImageUrl || profile.logoUrl} glow={false} float={false} />
            </span>
          )}
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[14.5px] font-extrabold">{profile.title}</span>
            <span className="vf-muted flex min-w-0 items-center gap-1.5 text-[11.5px]">
              <span className="truncate">{profile.category}</span>
              <span className="opacity-50">·</span>
              <span className="hidden truncate sm:inline">{profile.availability}</span>
            </span>
          </span>
        </button>
        <div className="ml-auto flex items-center gap-2.5">
          {view !== "landing" && (
            <button onClick={onHome} className="vf-btn vf-btn-ghost px-3 py-2 text-[13.5px]">
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Home</span>
            </button>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
            <GreenDot /> {profile.availability}
          </span>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// LandingRenderer — switches the WHOLE page structure on layoutVariant so each
// template renders a genuinely different landing page, not just a recolor.
// ---------------------------------------------------------------------------
function LandingRenderer(props) {
  return <PublicAgentProfile {...props} />;
}

// ---- Shared landing building blocks ---------------------------------------
function isOnlineAvailability(value) {
  return !/(offline|paused|closed|unavailable|away)/i.test(String(value || ""));
}

function isRestaurantProfile(profile) {
  return /(restaurant|food|cafe|café|dining|hotel|bar|bakery|kitchen)/i.test(`${profile.category} ${profile.businessName} ${profile.title}`);
}

function chatCtaLabel(profile) {
  if (isRestaurantProfile(profile)) return "Ask about reservations";
  return profile.cta || "Start conversation";
}

function bookingCtaLabel(profile) {
  if (isRestaurantProfile(profile)) return "Book Table";
  return profile.secondaryCta || "Book Appointment";
}

function PublicAgentProfile({
  profile,
  showBusinessInfo,
  showAppointment,
  showVoiceCall,
  showAgentImage,
  showLogo,
  chatEnabled,
  onStart,
  onCall,
  onBook
}) {
  const online = isOnlineAvailability(profile.availability);
  const chatLabel = chatCtaLabel(profile);
  const bookingLabel = bookingCtaLabel(profile);
  const visualImage = profile.agentImageUrl || profile.logoUrl;

  return (
    <div className="vf-public-wrap vf-enter">
      <section className="vf-public-panel" aria-label={`${profile.title} public profile`}>
        <ProfilePanelHeader profile={profile} showLogo={showLogo} online={online} />

        <div className="vf-public-hero">
          <section className="vf-public-visual-section">
            <AgentVisualCard profile={profile} showAgentImage={showAgentImage} imageSrc={visualImage} />
          </section>

          <section className="vf-public-info-section">
            <AiAssistantBadge />
            <h1 className="vf-public-title">{profile.title}</h1>
            <p className="vf-public-description">{profile.subtitle}</p>
            <CapabilityPills profile={profile} online={online} showVoiceCall={showVoiceCall} />

            <div className="vf-public-actions">
              <button
                className="vf-public-primary group"
                onClick={onStart}
                disabled={!chatEnabled}
                title={chatEnabled ? chatLabel : "Chat is not enabled for this assistant."}
              >
                <span className="vf-action-icon"><MessageCircle size={25} /></span>
                <span>{chatEnabled ? chatLabel : "Chat unavailable"}</span>
                <ArrowRight className="vf-primary-arrow" size={30} />
              </button>

              <div className="vf-public-secondary-grid">
                <button
                  className="vf-public-secondary"
                  onClick={onBook}
                  disabled={!showAppointment}
                  title={showAppointment ? bookingLabel : "Booking is not enabled for this page."}
                >
                  <span className="vf-action-icon"><CalendarDays size={24} /></span>
                  <span>{bookingLabel}</span>
                  {!showAppointment && <small>Unavailable</small>}
                </button>

                <button
                  className="vf-public-secondary"
                  onClick={onCall}
                  disabled={!showVoiceCall}
                  title={showVoiceCall ? "Start a voice call" : "Voice calling is not enabled for this assistant."}
                >
                  <span className="vf-action-icon"><Headphones size={25} /></span>
                  <span>Talk to Assistant</span>
                  {!showVoiceCall && <small>Unavailable</small>}
                </button>
              </div>
            </div>
          </section>
        </div>

        {showBusinessInfo && <BusinessInformationBar profile={profile} />}
      </section>
    </div>
  );
}

function ProfilePanelHeader({ profile, showLogo, online }) {
  return (
    <header className="vf-public-header">
      <button className="vf-public-identity" type="button" aria-label={profile.title}>
        {showLogo && (
          <span className="vf-public-avatar">
            <Robot size={56} src={profile.agentImageUrl || profile.logoUrl} glow={false} float={false} />
          </span>
        )}
        <span className="vf-public-identity-copy">
          <strong>{profile.businessName || profile.title}</strong>
          <span>
            {profile.category}
            <span className="vf-header-dot-separator">·</span>
            <StatusDot online={online} />
            {profile.availability}
          </span>
        </span>
      </button>

      <span className={`vf-public-status-pill ${online ? "" : "is-offline"}`}>
        <StatusDot online={online} />
        {profile.availability}
      </span>
    </header>
  );
}

function AgentVisualCard({ profile, showAgentImage, imageSrc }) {
  return (
    <div className="vf-agent-visual-card">
      <Sparkles className="vf-sparkle vf-sparkle-a" size={25} />
      <Sparkles className="vf-sparkle vf-sparkle-b" size={18} />
      <Sparkles className="vf-sparkle vf-sparkle-c" size={15} />
      {showAgentImage ? (
        <span className="vf-agent-image-circle">
          <Robot size={330} src={imageSrc} glow float />
        </span>
      ) : (
        <span className="vf-missing-avatar">
          <Sparkles size={42} />
        </span>
      )}

      <div className="vf-agent-visual-note">
        <span className="vf-note-icon"><Sparkles size={22} /></span>
        <p>{profile.welcome || profile.subtitle}</p>
      </div>
    </div>
  );
}

function AiAssistantBadge() {
  return (
    <span className="vf-assistant-badge">
      <Sparkles size={18} />
      AI Assistant
    </span>
  );
}

function CapabilityPills({ profile, online, showVoiceCall }) {
  const pills = [
    { key: "online", icon: "dot", label: online ? profile.availability : "Offline" },
    { key: "response", Icon: Zap, label: profile.responseTime || "Fast response" },
    { key: "assistant", Icon: Sparkles, label: "AI assistant" },
    { key: "voice", Icon: Headphones, label: showVoiceCall ? "Voice enabled" : "Voice unavailable", disabled: !showVoiceCall }
  ];

  return (
    <div className="vf-capability-pills" aria-label="Assistant capabilities">
      {pills.map(({ key, Icon, icon, label, disabled }) => (
        <span key={key} className={`vf-capability-pill ${disabled ? "is-disabled" : ""}`}>
          {icon === "dot" ? <StatusDot online={online} /> : <Icon size={17} />}
          {label}
        </span>
      ))}
    </div>
  );
}

function BusinessInformationBar({ profile }) {
  const hasLocation = profile.location && !/^unknown|not provided$/i.test(profile.location);

  return (
    <footer className="vf-business-bar">
      <div className="vf-business-item">
        <span className="vf-business-icon"><Utensils size={22} /></span>
        <strong>{profile.category}</strong>
      </div>
      {hasLocation && (
        <>
          <span className="vf-business-divider" />
          <div className="vf-business-item vf-business-location">
            <span className="vf-business-icon"><MapPin size={22} /></span>
            <span>{profile.location}</span>
          </div>
        </>
      )}
    </footer>
  );
}

function StatusDot({ online = true }) {
  return (
    <span className={`vf-status-dot ${online ? "" : "is-offline"}`}>
      <span />
    </span>
  );
}

function ProfileSkeleton() {
  return (
    <div className="vf-public-wrap">
      <section className="vf-public-panel vf-profile-skeleton" aria-label="Loading assistant profile">
        <div className="vf-public-header">
          <div className="vf-skeleton-row">
            <span className="vf-skeleton-avatar" />
            <span className="vf-skeleton-stack"><i /><i /></span>
          </div>
          <span className="vf-skeleton-pill" />
        </div>
        <div className="vf-public-hero">
          <div className="vf-skeleton-visual" />
          <div className="vf-skeleton-copy">
            <i className="short" />
            <i className="title" />
            <i />
            <i />
            <span />
            <div className="vf-skeleton-buttons"><b /><b /></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileErrorState({ message }) {
  return (
    <div className="vf-public-wrap">
      <section className="vf-public-panel vf-profile-error">
        <span className="vf-note-icon"><PhoneOff size={24} /></span>
        <h1>Assistant page unavailable</h1>
        <p>{message || "This public profile could not be loaded."}</p>
      </section>
    </div>
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
    <div className="vf-chat-page vf-enter grid w-full place-items-center px-4 py-5 sm:px-5 sm:py-7">
      <div className="vf-chat-panel flex h-[min(820px,calc(100vh-112px))] w-full max-w-[820px] flex-col overflow-hidden rounded-[26px]">
        <div className="vf-chat-header flex items-center gap-3 px-4 py-3.5 sm:px-5">
          <button className="vf-btn vf-chat-icon-btn p-2.5" onClick={onBack} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <Robot size={42} src={profile.agentImageUrl || profile.logoUrl} glow={false} float={false} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-extrabold">{profile.title}</div>
            <div className="vf-chat-status inline-flex items-center gap-1.5 text-[12.5px]">{typing ? "typing..." : <><GreenDot /> Online</>}</div>
          </div>
          <div className="ml-auto flex gap-2">
            {showVoiceCall && (
              <button className="vf-btn vf-chat-action px-3 py-2 text-sm" onClick={onCall}>
                <Headphones size={17} /> <span className="hidden sm:inline">Call</span>
              </button>
            )}
            {showAppointment && (
              <button className="vf-btn vf-chat-action px-3 py-2 text-sm" onClick={onBook}>
                <CalendarDays size={17} /> <span className="hidden sm:inline">Book</span>
              </button>
            )}
          </div>
        </div>

        {(error || notice) && (
          <div className="grid gap-2 px-4 pt-4 sm:px-6">
            {error && <div className="vf-chat-alert vf-chat-alert-error rounded-xl px-3 py-2 text-sm font-semibold">{error}</div>}
            {notice && <div className="vf-chat-alert rounded-xl px-3 py-2 text-sm font-semibold">{notice}</div>}
          </div>
        )}

        <div ref={scrollRef} className="vf-chat-scroll vf-scroll flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.map((item) => (
            <Bubble key={item.id} message={item} profile={profile} />
          ))}
          {typing && <TypingBubble profile={profile} />}
          {messages.length <= 1 && !typing && (
            <div className="mt-1">
              <div className="vf-chat-suggested-label mb-2.5 text-[12.5px] font-bold">SUGGESTED</div>
              <div className="flex flex-wrap gap-2.5">
                {quickTopics.map((cat, index) => {
                  return (
                    <button key={cat.id || index} onClick={() => onSuggestion(cat.prompt || cat.title)} className="vf-chat-suggestion vf-tile inline-flex items-center gap-2 rounded-[14px] px-3.5 py-2.5 text-sm font-semibold">
                      <TopicIcon topic={cat} size={18} />
                      {cat.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <form className="vf-chat-inputbar flex items-center gap-2.5 px-3.5 py-4 sm:px-5" onSubmit={onSubmit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={chatEnabled ? "Ask about admissions, courses, fees..." : "Chat is not enabled for this agent."}
            disabled={!chatEnabled}
            className="vf-chat-input min-w-0 flex-1 rounded-[16px] px-4 py-3 text-[15px] outline-none"
          />
          <button type="submit" className="vf-btn vf-chat-send px-4 py-3" disabled={!input.trim() || typing || !chatEnabled} aria-label="Send">
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

function VoiceCallModal({ profile, status, muted, error, onStart, onEnd, onMuteToggle, onRetry, onClose, onChat }) {
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
            <span className="vf-call-status-label">
              <GreenDot /> {isLive ? (muted ? "Muted voice call" : "Live voice call") : "Connecting"}
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
            <p className="mt-1 text-[14px] text-[#a4ada7]">
              {isLive ? (muted ? "Your microphone is muted." : "Voice line is active. Say hello!") : "Connecting to AI voice agent..."}
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
                <>
                  <button
                    className={`vf-call-control ${muted ? "is-muted" : ""}`}
                    onClick={onMuteToggle}
                    aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                  >
                    {muted ? <MicOff size={22} /> : <Mic size={22} />}
                  </button>
                  <button
                    className="vf-call-end"
                    onClick={onEnd}
                    aria-label="End call"
                  >
                    <PhoneOff size={22} />
                  </button>
                </>
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

      <div className={`${isUser ? "vf-user-bubble rounded-br-md" : "vf-assistant-bubble rounded-bl-md"} max-w-[78%] rounded-[18px] px-4 py-3 text-[15px] leading-normal ${message.error ? "vf-bubble-error" : ""}`}>
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

      <div className="vf-assistant-bubble vf-typing flex items-center gap-1.5 rounded-[18px] rounded-bl-md px-4 py-3.5">
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
.vf-theme.vf-public-profile-shell{--background-main:#000301;--background-panel:#06100b;--background-card:rgba(8,22,14,.78);--background-glass:rgba(12,28,18,.62);--green-primary:#72ff68;--green-bright:#a6ff5f;--green-dark:#164c28;--text-primary:#f4f7f5;--text-secondary:#a4ada7;--text-muted:#6f7a73;--border-green:rgba(120,255,105,.32);--border-soft:rgba(255,255,255,.09);min-height:100vh;background-color:var(--background-main);background-image:radial-gradient(70% 64% at 76% 8%,rgba(67,91,7,.62),rgba(28,44,4,.28) 46%,rgba(0,0,0,0) 76%),radial-gradient(48% 42% at 50% 38%,rgba(34,45,21,.34),rgba(0,0,0,0) 72%),linear-gradient(180deg,rgba(0,0,0,.08) 0%,rgba(0,0,0,.7) 72%,#000 100%),linear-gradient(90deg,#000 0%,#020503 42%,#050b02 100%);background-repeat:no-repeat;background-attachment:fixed;color:var(--text-primary);font-family:"App Body Inter",Inter,ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;padding:clamp(10px,2vw,28px);overflow-x:hidden}
.vf-theme.vf-public-dark-shell{--background-main:#000301;--background-panel:#06100b;--background-card:rgba(8,22,14,.78);--background-glass:rgba(12,28,18,.62);--green-primary:#72ff68;--green-bright:#a6ff5f;--green-dark:#164c28;--text-primary:#f4f7f5;--text-secondary:#a4ada7;--text-muted:#6f7a73;--border-green:rgba(120,255,105,.32);--border-soft:rgba(255,255,255,.09);min-height:100vh;background-color:var(--background-main);background-image:radial-gradient(70% 64% at 76% 8%,rgba(67,91,7,.62),rgba(28,44,4,.28) 46%,rgba(0,0,0,0) 76%),radial-gradient(42% 38% at 10% 24%,rgba(0,112,91,.22),rgba(0,0,0,0) 74%),linear-gradient(180deg,rgba(0,0,0,.08) 0%,rgba(0,0,0,.74) 74%,#000 100%),linear-gradient(90deg,#000 0%,#020503 42%,#050b02 100%);background-repeat:no-repeat;background-attachment:fixed;color:var(--text-primary);font-family:"App Body Inter",Inter,ui-sans-serif,system-ui,sans-serif;overflow-x:hidden}
.vf-public-dark-shell .vf-topbar{border-bottom-color:rgba(255,255,255,.08);background:rgba(3,12,8,.86);box-shadow:0 16px 40px rgba(0,0,0,.28);color:var(--text-primary)}
.vf-public-dark-shell .vf-topbar .vf-landing{max-width:1024px}
.vf-public-dark-shell .vf-topbar .vf-muted{color:var(--text-secondary)}
.vf-public-dark-shell .vf-topbar .vf-btn-ghost{border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:var(--text-primary);box-shadow:none}
.vf-public-dark-shell .vf-topbar .vf-btn-ghost:hover{border-color:rgba(120,255,105,.32);background:rgba(114,255,104,.08)}
.vf-public-dark-shell .vf-topbar .bg-emerald-50{border-color:rgba(120,255,105,.26)!important;background:rgba(114,255,104,.1)!important;color:var(--green-primary)!important}
.vf-chat-page{min-height:calc(100vh - 66px);padding-bottom:clamp(18px,3vh,34px)}
.vf-chat-panel{border:1px solid rgba(117,255,104,.24);background:linear-gradient(180deg,rgba(4,15,10,.94),rgba(2,9,7,.96));box-shadow:0 0 0 1px rgba(255,255,255,.035) inset,0 24px 90px rgba(0,0,0,.5),0 0 70px rgba(86,255,88,.11);color:var(--text-primary);backdrop-filter:blur(22px)}
.vf-chat-header{border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(90deg,rgba(33,112,40,.16),rgba(1,8,6,.24) 48%,rgba(1,8,6,.38))}
.vf-chat-status,.vf-chat-suggested-label{color:var(--text-secondary)}
.vf-chat-icon-btn,.vf-chat-action{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:var(--text-primary);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
.vf-chat-icon-btn:hover,.vf-chat-action:hover{border-color:rgba(120,255,105,.34);background:rgba(114,255,104,.09);color:var(--green-primary)}
.vf-chat-alert{border:1px solid rgba(96,165,250,.24);background:rgba(59,130,246,.1);color:#bfdbfe}
.vf-chat-alert-error{border-color:rgba(244,63,94,.32);background:rgba(244,63,94,.1);color:#fecdd3}
.vf-chat-scroll{background:radial-gradient(46% 36% at 50% 0%,rgba(114,255,104,.08),rgba(0,0,0,0) 70%)}
.vf-chat-suggestion{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);color:var(--text-primary);box-shadow:0 10px 26px rgba(0,0,0,.18)}
.vf-chat-suggestion:hover{border-color:rgba(120,255,105,.34);background:rgba(23,60,31,.36);box-shadow:0 0 26px rgba(114,255,104,.12)}
.vf-assistant-bubble{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.055);color:var(--text-primary);box-shadow:0 16px 35px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.04)}
.vf-user-bubble{border:1px solid rgba(120,255,105,.46);background:linear-gradient(135deg,rgba(18,72,31,.98),rgba(6,25,14,.96) 46%,rgba(77,180,62,.9));color:#f4fff2;box-shadow:0 0 26px rgba(114,255,104,.16)}
.vf-bubble-error{border-color:rgba(244,63,94,.32);color:#fecdd3}
.vf-chat-inputbar{border-top:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(8,20,14,.9),rgba(2,9,7,.98));box-shadow:0 -18px 45px rgba(0,0,0,.34),0 -1px 0 rgba(120,255,105,.1) inset}
.vf-chat-input{min-height:52px;border:1px solid rgba(120,255,105,.24);background:rgba(255,255,255,.055);color:var(--text-primary);box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 0 0 1px rgba(0,0,0,.12)}
.vf-chat-input::placeholder{color:rgba(164,173,167,.92)}
.vf-chat-input:focus{border-color:rgba(120,255,105,.68);background:rgba(255,255,255,.08);box-shadow:0 0 0 4px rgba(114,255,104,.12),0 0 30px rgba(114,255,104,.14)}
.vf-chat-input:disabled{cursor:not-allowed;opacity:.58}
.vf-chat-send{min-width:56px;min-height:52px;border:1px solid rgba(120,255,105,.48);border-radius:16px;background:linear-gradient(135deg,rgba(18,72,31,.98),rgba(77,180,62,.92));color:#f4fff2;box-shadow:0 0 24px rgba(114,255,104,.2)}
.vf-chat-send:hover:not(:disabled){border-color:rgba(166,255,95,.78);box-shadow:0 0 34px rgba(114,255,104,.28)}
.vf-chat-send:disabled{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.07);color:rgba(255,255,255,.32);box-shadow:none}
.vf-public-wrap{width:100%;display:grid;place-items:center}
.vf-public-panel{width:min(calc(100% - 48px),1180px);max-width:1180px;overflow:hidden;border:1px solid rgba(117,255,104,.32);border-radius:28px;background:linear-gradient(180deg,rgba(3,14,9,.9),rgba(2,9,7,.9));box-shadow:0 0 0 1px rgba(255,255,255,.035) inset,0 24px 90px rgba(0,0,0,.52),0 0 70px rgba(86,255,88,.13);backdrop-filter:blur(22px)}
.vf-public-header{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 30px;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(90deg,rgba(33,112,40,.18),rgba(1,8,6,.08) 45%,rgba(1,8,6,.3))}
.vf-public-identity{display:flex;min-width:0;align-items:center;gap:18px;text-align:left;color:var(--text-primary)}
.vf-public-avatar{display:grid;width:58px;height:58px;flex:0 0 auto;place-items:center;overflow:hidden;border:1px solid rgba(120,255,105,.45);border-radius:15px;background:radial-gradient(circle at 38% 28%,rgba(166,255,95,.32),rgba(13,44,21,.9));box-shadow:0 0 24px rgba(114,255,104,.18),inset 0 0 18px rgba(255,255,255,.06)}
.vf-public-identity-copy{display:grid;min-width:0;gap:5px}
.vf-public-identity-copy strong{overflow:hidden;font-size:24px;font-weight:800;line-height:1.05;text-overflow:ellipsis;white-space:nowrap}
.vf-public-identity-copy span{display:flex;min-width:0;align-items:center;gap:8px;color:var(--text-secondary);font-size:17px;line-height:1.2}
.vf-header-dot-separator{opacity:.55}
.vf-public-status-pill{display:inline-flex;flex:0 0 auto;align-items:center;gap:10px;padding:11px 20px;border:1px solid rgba(255,255,255,.11);border-radius:999px;background:rgba(255,255,255,.035);color:var(--green-primary);font-size:16px;font-weight:700;box-shadow:inset 0 1px 0 rgba(255,255,255,.05);transition:border-color .2s,box-shadow .2s,transform .2s}
.vf-public-status-pill:hover{border-color:rgba(120,255,105,.38);box-shadow:0 0 24px rgba(114,255,104,.12)}
.vf-public-status-pill.is-offline{color:#b8c2bc}
.vf-status-dot{position:relative;display:inline-grid;width:14px;height:14px;flex:0 0 auto;place-items:center;border-radius:999px}
.vf-status-dot::before{position:absolute;inset:-6px;border-radius:inherit;background:rgba(114,255,104,.26);content:"";animation:vfPulseRing 2s ease-out infinite}
.vf-status-dot span{position:relative;width:14px;height:14px;border-radius:inherit;background:var(--green-primary);box-shadow:0 0 12px rgba(114,255,104,.75)}
.vf-status-dot.is-offline::before{display:none}
.vf-status-dot.is-offline span{background:#738077;box-shadow:none}
.vf-public-hero{display:grid;width:calc(100% - 80px);max-width:1100px;margin:0 auto;grid-template-areas:"visual info";grid-template-columns:minmax(300px,41%) minmax(0,59%);align-items:center;gap:44px;padding:24px 0 16px}
.vf-public-visual-section{grid-area:visual;min-width:0}
.vf-public-info-section{grid-area:info;min-width:0}
.vf-agent-visual-card{position:relative;display:grid;min-height:310px;place-items:center;overflow:visible;border:0;border-radius:0;background:transparent;box-shadow:none}
.vf-agent-visual-card::before{position:absolute;width:72%;max-width:430px;aspect-ratio:1;border:1px solid rgba(114,255,104,.6);border-radius:999px;background:radial-gradient(circle,rgba(114,255,104,.16),rgba(114,255,104,.05) 45%,transparent 70%);box-shadow:0 0 44px rgba(114,255,104,.22);content:"";animation:vfGlowBreathe 4.4s ease-in-out infinite}
.vf-agent-image-circle{position:relative;z-index:1;display:grid;width:min(78%,390px);aspect-ratio:1;place-items:center;overflow:hidden;border:1px solid rgba(120,255,105,.52);border-radius:999px;background:radial-gradient(circle at 50% 38%,rgba(114,255,104,.16),rgba(11,28,13,.86) 42%,rgba(0,3,1,.98) 100%);box-shadow:inset 0 0 36px rgba(255,255,255,.04),0 0 42px rgba(114,255,104,.18),0 28px 54px rgba(0,0,0,.42)}
.vf-agent-image-circle .vf-robot-wrap{width:88%!important;height:88%!important;overflow:hidden;border-radius:999px;background:radial-gradient(circle at 50% 42%,rgba(20,116,50,.46),rgba(3,14,9,.86) 56%,rgba(0,3,1,.98) 100%)}
.vf-agent-image-circle .vf-robot-glow{display:none}
.vf-agent-image-circle .vf-robot-img{width:118%;height:118%;border-radius:999px;object-fit:cover;object-position:center 48%;background:transparent}
.vf-agent-visual-card .vf-robot-wrap{z-index:1;max-width:min(74%,250px);max-height:250px}
.vf-agent-visual-card .vf-robot-img{filter:drop-shadow(0 26px 36px rgba(0,0,0,.4)) drop-shadow(0 0 24px rgba(114,255,104,.18))}
.vf-sparkle{position:absolute;z-index:2;color:#d7ffd0;filter:drop-shadow(0 0 8px rgba(114,255,104,.8));opacity:.95}
.vf-sparkle-a{left:12%;top:18%}.vf-sparkle-b{right:12%;top:12%}.vf-sparkle-c{right:8%;bottom:30%}
.vf-agent-visual-note{position:absolute;right:20px;bottom:18px;left:20px;z-index:3;display:flex;align-items:center;gap:12px;padding:13px 14px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(8,20,14,.74);box-shadow:0 14px 34px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(18px)}
.vf-note-icon{display:grid;width:42px;height:42px;flex:0 0 auto;place-items:center;border:1px solid rgba(120,255,105,.24);border-radius:999px;background:rgba(114,255,104,.12);color:var(--green-primary);box-shadow:0 0 22px rgba(114,255,104,.16)}
.vf-agent-visual-note p{margin:0;color:var(--text-primary);font-size:14px;font-weight:650;line-height:1.38}
.vf-missing-avatar{z-index:1;display:grid;width:180px;height:180px;place-items:center;border-radius:999px;background:rgba(114,255,104,.1);color:var(--green-primary)}
.vf-assistant-badge{display:inline-flex;align-items:center;gap:9px;padding:10px 16px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(255,255,255,.035);color:#c8ff9c;font-size:14.5px;font-weight:800}
.vf-assistant-badge svg,.vf-capability-pill svg,.vf-business-icon svg,.vf-action-icon svg{color:var(--green-primary)}
.vf-public-title{margin:20px 0 0;color:var(--text-primary);font-size:clamp(34px,3.8vw,48px);font-weight:850;letter-spacing:0;line-height:1;text-wrap:balance}
.vf-public-description{max-width:620px;margin:15px 0 0;color:var(--text-secondary);font-size:clamp(15px,1.15vw,17px);line-height:1.45}
.vf-capability-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.vf-capability-pill{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:8px 14px;border:1px solid rgba(255,255,255,.09);border-radius:999px;background:rgba(255,255,255,.035);color:var(--text-primary);font-size:13.5px;font-weight:700;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
.vf-capability-pill.is-disabled{color:var(--text-muted);opacity:.78}
.vf-public-actions{display:grid;gap:12px;margin-top:20px}
.vf-public-primary,.vf-public-secondary{position:relative;display:flex;min-width:0;align-items:center;border:1px solid rgba(255,255,255,.09);color:var(--text-primary);transition:transform .18s,border-color .2s,box-shadow .2s,background .2s}
.vf-public-primary{width:100%;height:58px;gap:14px;padding:0 18px;border-color:rgba(120,255,105,.58);border-radius:16px;background:linear-gradient(135deg,rgba(18,72,31,.98),rgba(6,25,14,.96) 44%,rgba(77,180,62,.9));box-shadow:0 0 0 1px rgba(255,255,255,.04) inset,0 0 24px rgba(114,255,104,.18);font-size:18px;font-weight:800;text-align:left}
.vf-public-primary:hover:not(:disabled){transform:translateY(-2px);border-color:rgba(166,255,95,.86);box-shadow:0 0 0 1px rgba(255,255,255,.06) inset,0 20px 55px rgba(0,0,0,.34),0 0 38px rgba(114,255,104,.34)}
.vf-public-primary:active:not(:disabled){transform:translateY(0)}
.vf-public-primary:disabled,.vf-public-secondary:disabled{cursor:not-allowed;opacity:.52}
.vf-primary-arrow{margin-left:auto;transition:transform .2s}
.vf-public-primary:hover:not(:disabled) .vf-primary-arrow{transform:translateX(7px)}
.vf-public-secondary-grid{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
.vf-public-secondary{height:52px;justify-content:center;gap:12px;padding:0 16px;border-radius:16px;background:rgba(255,255,255,.035);box-shadow:inset 0 1px 0 rgba(255,255,255,.04);font-size:15.5px;font-weight:800}
.vf-public-secondary:hover:not(:disabled){transform:translateY(-2px);border-color:rgba(120,255,105,.34);background:rgba(23,60,31,.36);box-shadow:0 0 26px rgba(114,255,104,.12)}
.vf-public-secondary small{display:block;margin-left:4px;color:var(--text-muted);font-size:12px;font-weight:700}
.vf-action-icon{display:grid;width:32px;height:32px;flex:0 0 auto;place-items:center;border-radius:999px;background:rgba(114,255,104,.08);box-shadow:0 0 18px rgba(114,255,104,.08)}
.vf-business-bar{display:flex;width:min(700px,calc(100% - 48px));align-items:center;justify-content:center;gap:18px;margin:0 auto 16px;padding:11px 20px;border:1px solid rgba(255,255,255,.09);border-radius:18px;background:rgba(255,255,255,.035);color:var(--text-secondary);box-shadow:inset 0 1px 0 rgba(255,255,255,.04);backdrop-filter:blur(16px)}
.vf-business-item{display:flex;min-width:0;align-items:center;gap:12px;font-size:16px;line-height:1.35}
.vf-business-item strong{color:var(--text-primary);font-weight:800}
.vf-business-location span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vf-business-icon{display:grid;width:34px;height:34px;flex:0 0 auto;place-items:center;border-radius:999px;background:rgba(114,255,104,.08);box-shadow:0 0 18px rgba(114,255,104,.08)}
.vf-business-divider{width:1px;height:28px;background:rgba(255,255,255,.12)}
.vf-profile-skeleton .vf-public-header,.vf-profile-skeleton .vf-public-hero{pointer-events:none}
.vf-skeleton-row{display:flex;align-items:center;gap:18px}.vf-skeleton-avatar,.vf-skeleton-pill,.vf-skeleton-stack i,.vf-skeleton-visual,.vf-skeleton-copy i,.vf-skeleton-copy span,.vf-skeleton-buttons b{display:block;border-radius:16px;background:linear-gradient(100deg,rgba(255,255,255,.05),rgba(114,255,104,.13),rgba(255,255,255,.05));background-size:220% 100%;animation:vfShimmer 1.5s linear infinite}
.vf-skeleton-avatar{width:68px;height:68px}.vf-skeleton-pill{width:172px;height:54px;border-radius:999px}.vf-skeleton-stack{display:grid;gap:10px}.vf-skeleton-stack i:first-child{width:240px;height:24px}.vf-skeleton-stack i:last-child{width:180px;height:18px}
.vf-skeleton-visual{min-height:500px;border-radius:28px}.vf-skeleton-copy{display:grid;align-content:center;gap:18px}.vf-skeleton-copy i{width:70%;height:20px}.vf-skeleton-copy .short{width:180px;height:44px;border-radius:999px}.vf-skeleton-copy .title{width:86%;height:70px}.vf-skeleton-copy span{width:100%;height:84px;border-radius:22px}.vf-skeleton-buttons{display:grid;gap:20px;grid-template-columns:1fr 1fr}.vf-skeleton-buttons b{height:76px;border-radius:22px}
.vf-profile-error{display:grid;min-height:420px;place-items:center;justify-items:center;padding:40px;text-align:center}.vf-profile-error h1{margin:18px 0 0;color:var(--text-primary);font-size:clamp(28px,4vw,44px);letter-spacing:0}.vf-profile-error p{max-width:520px;margin:10px 0 0;color:var(--text-secondary);font-size:17px;line-height:1.6}
.vf-modal-overlay{background:rgba(0,7,5,.7)}
.vf-modal{border-color:rgba(120,255,105,.22);background:linear-gradient(180deg,rgba(6,18,11,.98),rgba(2,8,6,.98));box-shadow:0 30px 90px rgba(0,0,0,.62),0 0 50px rgba(114,255,104,.14);color:var(--text-primary)}
.vf-modal-x{background:rgba(255,255,255,.06);color:#a4ada7}.vf-modal-x:hover{background:rgba(114,255,104,.1);color:#f4f7f5}
.vf-call-status-label{display:inline-flex;align-items:center;gap:8px;color:#a4ada7;font-size:11.5px;font-weight:850;letter-spacing:.1em;text-transform:uppercase}
.vf-call-orb{background:linear-gradient(160deg,rgba(16,54,25,.98),rgba(9,27,16,.96));border-color:rgba(120,255,105,.3);box-shadow:inset 0 2px 18px rgba(255,255,255,.08),0 0 34px rgba(114,255,104,.18)}
.vf-step{background:rgba(255,255,255,.04)}.vf-step-active{color:var(--green-primary);background:rgba(114,255,104,.1);border-color:rgba(120,255,105,.22)}.vf-step-active .vf-step-dot{background:rgba(114,255,104,.14);color:var(--green-primary)}
.vf-call-control,.vf-call-end{display:grid;width:56px;height:56px;place-items:center;border-radius:999px;color:#fff;transition:transform .18s,box-shadow .2s,background .2s}
.vf-call-control{border:1px solid rgba(120,255,105,.32);background:rgba(114,255,104,.1);color:var(--green-primary);box-shadow:0 0 20px rgba(114,255,104,.12)}
.vf-call-control.is-muted{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.08);color:#a4ada7}
.vf-call-end{background:#e11d48;box-shadow:0 10px 26px rgba(225,29,72,.35)}
.vf-call-control:hover,.vf-call-end:hover{transform:translateY(-2px)}
.vf-call-end:hover{background:#be123c}
@keyframes vfGlowBreathe{0%,100%{transform:scale(.96);opacity:.72}50%{transform:scale(1.04);opacity:1}}
@keyframes vfShimmer{to{background-position:-220% 0}}
@media (max-width:1180px){.vf-public-panel{width:calc(100% - 28px)}.vf-public-hero{width:100%;max-width:none;grid-template-columns:minmax(280px,41%) minmax(0,59%);gap:30px;padding:24px}.vf-public-title{font-size:clamp(32px,5.2vw,46px)}.vf-agent-visual-card{min-height:310px}.vf-agent-visual-card .vf-robot-wrap{max-width:min(74%,250px)}}
@media (max-width:900px){.vf-theme.vf-public-profile-shell{align-items:start;padding:14px}.vf-public-panel{width:100%;border-radius:24px}.vf-public-header{padding:18px 20px}.vf-public-status-pill{padding:10px 14px;font-size:0}.vf-public-status-pill .vf-status-dot{margin:0}.vf-public-status-pill::after{content:"Online";font-size:14px}.vf-public-status-pill.is-offline::after{content:"Offline"}.vf-public-hero{grid-template-areas:"info" "visual";grid-template-columns:minmax(0,1fr);gap:28px;padding:28px 20px}.vf-public-visual-section{order:2}.vf-public-info-section{order:1}.vf-agent-visual-card{min-height:380px}.vf-public-description{font-size:17px}.vf-business-bar{width:calc(100% - 40px);margin-bottom:22px}}
@media (max-width:640px){.vf-theme.vf-public-profile-shell{padding:10px}.vf-public-panel{border-radius:20px}.vf-public-header{align-items:flex-start;gap:14px;padding:16px}.vf-public-avatar{width:52px;height:52px;border-radius:14px}.vf-public-avatar .vf-robot-wrap{width:44px!important;height:44px!important}.vf-public-identity{gap:12px}.vf-public-identity-copy strong{font-size:18px}.vf-public-identity-copy span{font-size:13px;gap:6px}.vf-public-hero{padding:24px 16px 20px}.vf-assistant-badge{padding:10px 14px;font-size:14px}.vf-public-title{margin-top:22px;font-size:clamp(38px,12vw,42px);line-height:1.02}.vf-capability-pills{gap:8px}.vf-capability-pill{min-height:36px;padding:8px 12px;font-size:13px}.vf-agent-visual-card{min-height:330px;border-radius:22px}.vf-agent-visual-card .vf-robot-wrap{max-width:min(82%,270px)}.vf-sparkle-a{left:8%;top:14%}.vf-agent-visual-note{right:16px;bottom:16px;left:16px;padding:14px;border-radius:18px}.vf-agent-visual-note p{font-size:14.5px}.vf-note-icon{width:42px;height:42px}.vf-public-primary{height:72px;padding:0 18px;font-size:18px;border-radius:18px}.vf-public-secondary-grid{grid-template-columns:minmax(0,1fr);gap:12px}.vf-public-secondary{height:64px;justify-content:flex-start;padding:0 18px;font-size:17px;border-radius:18px}.vf-business-bar{flex-direction:column;align-items:flex-start;gap:14px;width:calc(100% - 32px);padding:16px;border-radius:18px}.vf-business-divider{width:100%;height:1px}.vf-business-item{font-size:15px}.vf-business-location span:last-child{white-space:normal}.vf-skeleton-pill{display:none}.vf-skeleton-stack i:first-child{width:170px}.vf-skeleton-stack i:last-child{width:130px}.vf-skeleton-copy .title{height:54px}.vf-skeleton-buttons{grid-template-columns:1fr}}
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
@media (max-width:640px){.vf-cover-hero{min-height:340px}}
@media (prefers-reduced-motion:reduce){.vf-enter,.vf-robot-float,.vf-btn-primary,.vf-hero-visual,.vf-advisor-visual,.vf-tile,.vf-badge,.vf-agent-visual-card::before,.vf-status-dot::before,.vf-skeleton-avatar,.vf-skeleton-pill,.vf-skeleton-stack i,.vf-skeleton-visual,.vf-skeleton-copy i,.vf-skeleton-copy span,.vf-skeleton-buttons b{animation:none!important}.vf-public-primary:hover:not(:disabled),.vf-public-secondary:hover:not(:disabled),.vf-call-control:hover,.vf-call-end:hover{transform:none!important}}
`;