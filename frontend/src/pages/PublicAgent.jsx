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
  GraduationCap,
  Headphones,
  HeartPulse,
  HelpCircle,
  Home,
  Landmark,
  MapPin,
  MessageCircle,
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
  const showAppointment = (bio.showAppointmentButton ?? bio.showAppointment) !== false;
  const showVoiceCall = (bio.showVoiceCallButton ?? bio.showWebCallButton ?? bio.showWebCall) !== false && Boolean(agent?.publicWebCallEnabled);
  const primaryCta = text(bio.primaryCtaText || bio.ctaText, "Talk to AI Agent");
  const quickTopics = (Array.isArray(bio.quickTopics) && bio.quickTopics.length ? bio.quickTopics : defaultQuickTopics)
    .filter((topic) => topic.isVisible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, 8);
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
    agentImageUrl: assetUrl(bio.agentImageUrl || bio.logoUrl)
  };
  const pageStyle = {
    "--accent": "#2563EB",
    "--accent-d": "#1D4ED8",
    "--accent-soft": "#DBEAFE",
    "--accent-tint": "rgba(37,99,235,.14)",
    "--bg": "#F8FAFC",
    "--panel": "#FFFFFF",
    "--line": "#D8E4F5",
    "--text": "#0F172A",
    "--muted": "#64748B"
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
    <main className={`vf-theme vf-template-${bio.template || "coaching_education"} vf-anim-${bio.animation || "fade_in"} min-h-screen text-[#0f172a]`} style={pageStyle}>
      <style>{themeCss}</style>
      <TopBar profile={profile} view={view} onHome={() => setView("landing")} />

      {view === "landing" && (
        <Landing
          profile={profile}
          showBusinessInfo={bio.showBusinessInfo !== false}
          showAppointment={showAppointment}
          showVoiceCall={showVoiceCall}
          quickTopics={quickTopics}
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

function TopBar({ profile, view, onHome }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#d8e4f5] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[66px] max-w-[1200px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button onClick={onHome} className="flex min-w-0 items-center gap-3 text-left" aria-label="Home">
          <span className="vf-avatar-frame h-10 w-10 flex-none rounded-xl">
            <Robot size={34} src={profile.agentImageUrl || profile.logoUrl} glow={false} float={false} />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[14.5px] font-extrabold">{profile.title}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[#64748b]">
              <span className="truncate">{profile.category}</span>
              <span className="text-[#cbd5e1]">·</span>
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
            <GreenDot /> Online now
          </span>
        </div>
      </div>
    </header>
  );
}

function Landing({ profile, showBusinessInfo, showAppointment, showVoiceCall, quickTopics, onStart, onBook, onCall, onTile }) {
  return (
    <div className="vf-enter mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,.82fr)]">
        <section className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <AiPill />
          <div className="vf-hero-visual mt-6 grid w-full max-w-[440px] place-items-center rounded-[24px] p-6 sm:p-8">
            <Robot size={248} src={profile.agentImageUrl} glow float />
          </div>
          <h1 className="mt-6 text-[clamp(34px,5.4vw,58px)] font-black leading-[1.04] tracking-tight">{profile.title}</h1>
          <p className="mt-4 max-w-[500px] text-[15px] leading-relaxed text-[#64748b] sm:text-[17px]">{profile.subtitle}</p>
          <TrustChips showVoiceCall={showVoiceCall} />
        </section>

        <section className="flex w-full flex-col gap-5">
          {showBusinessInfo && (
            <div className="vf-glass rounded-[24px] p-2 sm:p-3">
              <InfoRow icon={Building2} label="Business" value={profile.businessName} first />
              <InfoRow icon={BookOpen} label="Category" value={profile.category} />
              <InfoRow icon={MapPin} label="Location" value={profile.location} />
              <InfoRow icon={Sparkles} label="Availability" value={profile.availability} dot />
              <InfoRow icon={Zap} label="Response Time" value={profile.responseTime} />
            </div>
          )}
          <div className="flex w-full flex-col gap-3">
            <button className="vf-btn vf-btn-primary vf-cta w-full px-5" onClick={onStart}>
              <MessageCircle size={19} /> {profile.cta} <ArrowRight size={18} className="ml-auto" />
            </button>
            {(showVoiceCall || showAppointment) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {showVoiceCall && (
                  <button className="vf-btn vf-btn-soft vf-cta-sec px-4" onClick={onCall} title="Start a voice call">
                    <Headphones size={18} /> {profile.voiceCta}
                  </button>
                )}
                {showAppointment && (
                  <button className="vf-btn vf-btn-ghost vf-cta-sec px-4" onClick={onBook}>
                    <CalendarDays size={18} /> {profile.secondaryCta}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="mt-12 sm:mt-14">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-[13px] font-extrabold uppercase tracking-[.12em] text-[#94a3b8]">Quick topics</h2>
            <p className="mt-0.5 text-[15px] font-bold text-[#0f172a]">Popular things people ask</p>
          </div>
          <span className="inline-flex items-center gap-1 text-[13px] font-bold text-[#2563eb]">
            Tap to ask <ArrowRight size={15} />
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickTopics.map((cat, index) => (
            <CategoryTile key={cat.id || index} cat={cat} onClick={onTile} />
          ))}
        </div>
      </section>
    </div>
  );
}

function TrustChips({ showVoiceCall }) {
  const chips = [
    { icon: "dot", label: "Online now" },
    { Icon: Zap, label: "Fast response" },
    { Icon: Sparkles, label: "AI assistant" }
  ];
  if (showVoiceCall) chips.push({ Icon: Headphones, label: "Voice enabled" });

  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2 lg:justify-start">
      {chips.map(({ Icon, label, icon }) => (
        <span key={label} className="vf-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-[#475569]">
          {icon === "dot" ? <GreenDot /> : <Icon size={14} className="text-[#2563eb]" />}
          {label}
        </span>
      ))}
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
      <span className="mt-1.5 text-[13px] leading-snug text-[#64748b]">{cat.description}</span>
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
    <div className={`flex items-center gap-3.5 px-3 py-3 ${first ? "" : "border-t border-[#e6eefb]"}`}>
      <span className="vf-icon-orb h-[38px] w-[38px] flex-none rounded-xl">{dot ? <GreenDot /> : <Icon size={18} />}</span>
      <span className="text-[14px] font-medium text-[#64748b]">{label}</span>
      <span className="ml-auto text-right text-[14.5px] font-bold text-[#0f172a]">{value}</span>
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

function AiPill() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#d8e4f5] bg-[#ffffff]/85 px-3.5 py-2 text-[12.5px] font-extrabold text-[#1d4ed8] shadow-[0_6px_18px_rgba(15,23,42,.06)]">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-[#dbeafe]"><Sparkles size={15} /></span>
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
.vf-theme{--accent:#2563eb;--accent-d:#1d4ed8;--accent-soft:#dbeafe;--accent-tint:rgba(37,99,235,.14);--bg:#f8fafc;--panel:#ffffff;--line:#d8e4f5;--text:#0f172a;--muted:#64748b;font-family:"App Body Stack Sans","App Body Inter","App Body Manrope","App Body Rethink Sans",ui-sans-serif,system-ui,sans-serif;background:radial-gradient(circle at 6% -4%,rgba(37,99,235,.08),transparent 30%),radial-gradient(circle at 98% 0%,rgba(14,165,233,.08),transparent 34%),var(--bg);overflow-x:hidden}
.vf-theme h1,.vf-theme h2,.vf-theme h3,.vf-theme h4,.vf-theme h5,.vf-theme h6{font-family:"App Heading Roboto","App Body Stack Sans",ui-sans-serif,system-ui,sans-serif}
.vf-theme *{overflow-wrap:anywhere}
.vf-glass{background:color-mix(in srgb,var(--panel) 88%,transparent);border:1px solid color-mix(in srgb,var(--line) 82%,white);box-shadow:0 14px 40px rgba(15,23,42,.08);backdrop-filter:blur(18px)}
.vf-card-solid{background:var(--panel);border:1px solid var(--line);box-shadow:0 6px 18px rgba(15,23,42,.06)}
.vf-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;font-weight:800;white-space:nowrap;transition:transform .1s,background .15s,box-shadow .2s,border-color .15s,color .15s}
.vf-btn:active{transform:translateY(1px)}.vf-btn:disabled{opacity:.5;cursor:not-allowed}
.vf-btn-primary{background:var(--accent);color:white;box-shadow:0 10px 24px rgba(37,99,235,.20)}.vf-btn-primary:hover{background:var(--accent-d)}
.vf-btn-ghost{background:var(--panel);color:var(--text);border:1px solid var(--line);box-shadow:0 6px 18px rgba(15,23,42,.06)}.vf-btn-ghost:hover{border-color:var(--accent);color:var(--accent-d)}
.vf-btn-soft{background:var(--accent-soft);color:#1d4ed8;border:1px solid #bfdbfe}.vf-btn-soft:hover{background:#bfdbfe}
.vf-icon-orb{display:grid;place-items:center;background:var(--accent-soft);color:#1d4ed8;flex:none}
.vf-tile{transition:transform .16s,box-shadow .2s,border-color .16s}.vf-tile:hover{transform:translateY(-2px);box-shadow:0 14px 40px rgba(15,23,42,.08);border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}
.vf-slot{transition:transform .1s,box-shadow .18s,border-color .15s}.vf-slot:active{transform:translateY(1px)}
.vf-input{width:100%;border-radius:13px;border:1px solid var(--line);background:#f8fafc;padding:12px 14px;font-size:15px;color:var(--text);outline:none}.vf-input::placeholder{color:#94a3b8}.vf-input:focus{border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-tint)}
.vf-robot-wrap{position:relative;display:grid;place-items:center;flex:none}.vf-robot-glow{position:absolute;inset:12%;border-radius:999px;background:radial-gradient(circle,var(--accent-tint),transparent 62%);filter:blur(6px)}
.vf-robot-img{position:relative;z-index:1;width:100%;height:100%;object-fit:contain;user-select:none;filter:drop-shadow(0 18px 28px rgba(37,99,235,.16))}
.vf-robot-float{animation:vfFloat 4s ease-in-out infinite}.vf-robot-react{animation:vfReact .55s ease}
.vf-enter{animation:vfViewIn .4s cubic-bezier(.2,.75,.25,1)}
.vf-scroll{scrollbar-width:thin;scrollbar-color:#bfdbfe transparent}.vf-scroll::-webkit-scrollbar{width:9px}.vf-scroll::-webkit-scrollbar-thumb{background:#bfdbfe;border-radius:99px}
.vf-typing span{width:6px;height:6px;border-radius:999px;background:#2563eb;animation:vfTyping 1s infinite}.vf-typing span:nth-child(2){animation-delay:.14s}.vf-typing span:nth-child(3){animation-delay:.28s}
.vf-pulse-ring{position:absolute;inset:28px;border:1px solid rgba(37,99,235,.32);border-radius:999px;animation:vfPulseScale 2s ease-out infinite}.vf-pulse-ring.vf-d2{animation-delay:.45s}.vf-pulse-ring.vf-d3{animation-delay:.9s}
.vf-eq{display:flex;align-items:center;justify-content:center;gap:5px;height:38px}.vf-eq span{width:6px;border-radius:99px;background:var(--accent);animation:vfEq .9s ease-in-out infinite}.vf-eq span:nth-child(odd){height:24px}.vf-eq span:nth-child(even){height:34px;animation-delay:.16s}
.vf-eq-lg{height:44px;gap:6px}.vf-eq-lg span{width:7px}.vf-eq-soft{opacity:.5;animation-duration:1.4s}
.vf-avatar-frame{display:grid;place-items:center;background:linear-gradient(150deg,#eff6ff,#dbeafe);border:1px solid #dbeafe;overflow:hidden}
.vf-chip{background:#fff;border:1px solid var(--line);box-shadow:0 2px 8px rgba(15,23,42,.05)}
.vf-hero-visual{position:relative;background:linear-gradient(165deg,#ffffff 0%,#eff6ff 55%,#dbeafe 100%);border:1px solid #dbeafe;box-shadow:0 24px 60px rgba(37,99,235,.14)}
.vf-hero-visual::before{content:"";position:absolute;inset:0;border-radius:inherit;background:radial-gradient(120px 120px at 30% 22%,rgba(255,255,255,.85),transparent 60%);pointer-events:none}
.vf-cta{height:56px;border-radius:15px;font-size:15.5px}
.vf-cta-sec{height:52px;border-radius:14px}
.vf-tile-orb{transition:transform .18s}.vf-tile:hover .vf-tile-orb{transform:scale(1.06)}
.vf-tile-arrow{opacity:.75;transition:opacity .18s,transform .18s}.vf-tile:hover .vf-tile-arrow{opacity:1;transform:translateX(2px)}
.vf-modal-overlay{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.55);backdrop-filter:blur(6px);animation:vfFadeIn .25s ease}
.vf-modal{position:relative;width:100%;max-width:400px;border-radius:28px;background:color-mix(in srgb,#ffffff 96%,transparent);border:1px solid #e6eefb;box-shadow:0 30px 80px rgba(15,23,42,.28);padding:26px 24px}
.vf-modal-in{animation:vfModalIn .34s cubic-bezier(.2,.8,.24,1)}
.vf-modal-x{position:absolute;top:14px;right:14px;display:grid;place-items:center;height:34px;width:34px;border-radius:12px;color:#94a3b8;background:#f1f5f9;transition:background .15s,color .15s}.vf-modal-x:hover{background:#e2e8f0;color:#0f172a}
.vf-call-orb{background:linear-gradient(160deg,#eff6ff,#dbeafe);border:1px solid #cfe0ff;box-shadow:inset 0 2px 10px rgba(255,255,255,.8),0 12px 30px rgba(37,99,235,.18)}
.vf-step{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;color:#94a3b8;background:#f8fafc;border:1px solid transparent;transition:all .2s}
.vf-step-dot{background:#e2e8f0;color:#94a3b8;flex:none;transition:all .2s}
.vf-step-active{color:#1d4ed8;background:#eff6ff;border-color:#dbeafe}.vf-step-active .vf-step-dot{background:#dbeafe;color:#1d4ed8}
.vf-step-done{color:#0f172a}.vf-step-done .vf-step-dot{background:#22c55e;color:#fff}
.vf-step-spin{height:15px;width:15px;border-radius:999px;border:2px solid #bfdbfe;border-top-color:#2563eb;animation:vfSpin .7s linear infinite}
@keyframes vfFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes vfReact{0%,100%{transform:translateY(0) rotate(0)}35%{transform:translateY(-6px) rotate(-2deg)}70%{transform:translateY(2px) rotate(2deg)}}@keyframes vfViewIn{from{transform:translateY(12px)}to{transform:none}}@keyframes vfPulseRing{from{transform:scale(.6);opacity:.8}to{transform:scale(2.3);opacity:0}}@keyframes vfTyping{0%,80%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}@keyframes vfPulseScale{from{transform:scale(.7);opacity:.7}to{transform:scale(1.35);opacity:0}}@keyframes vfEq{0%,100%{transform:scaleY(.5)}50%{transform:scaleY(1.15)}}
@keyframes vfSpin{to{transform:rotate(360deg)}}
@keyframes vfFadeIn{from{opacity:0}to{opacity:1}}
@keyframes vfModalIn{from{opacity:0;transform:translateY(16px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}
`;

