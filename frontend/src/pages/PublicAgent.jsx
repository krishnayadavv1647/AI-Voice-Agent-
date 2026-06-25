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
  Mic,
  PhoneOff,
  Phone,
  Send,
  Sparkles,
  Users,
  Utensils,
  User,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import robotHead from "../assets/voiceflow-theme/robot-head.png";
import robotImage from "../assets/voiceflow-theme/robot.png";
import { API_URL, api } from "../lib/api.js";
import { loadDograhWidget } from "../utils/loadDograhWidget.js";
import { requestMicrophoneAccess } from "../utils/microphone.js";

const defaultQuickTopics = [
  { id: "admissions", icon: "Landmark", iconType: "lucide", color: "#2563EB", title: "Admissions", description: "Understand the step-by-step admission process", prompt: "Walk me through the admission process.", isVisible: true, order: 0 },
  { id: "courses", icon: "BookOpen", iconType: "lucide", color: "#2563EB", title: "Courses", description: "Explore courses and batches", prompt: "What courses and batches do you offer?", isVisible: true, order: 1 },
  { id: "fees", icon: "DollarSign", iconType: "lucide", color: "#2563EB", title: "Fees", description: "Get details about fees and payments", prompt: "I want to know about fees and payment options.", isVisible: true, order: 2 },
  { id: "scholarships", icon: "GraduationCap", iconType: "lucide", color: "#2563EB", title: "Scholarships", description: "Find scholarships and financial aid", prompt: "What scholarships and financial aid are available?", isVisible: true, order: 3 }
];

const topicIconMap = {
  BadgePercent,
  BookOpen,
  Building2,
  Calendar,
  DollarSign,
  GraduationCap,
  HeartPulse,
  HelpCircle,
  Home,
  Landmark,
  MessageCircle,
  Phone,
  Users,
  Utensils
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

  async function startWebCall() {
    if (!agent?.publicWebCallEnabled) {
      setNotice("Voice calling is not enabled for this assistant yet. You can continue in chat.");
      setView("chat");
      return;
    }

    setError("");
    setNotice("");
    setCallStatus("connecting");
    setView("call");

    try {
      await requestMicrophoneAccess();
      const { embedToken } = await api(`/public/agents/${publicSlug}/web-call-token`, { method: "POST", auth: false });
      const widget = await loadDograhWidget(embedToken);

      widget.onCallConnected?.(() => setCallStatus("connected"));
      widget.onCallDisconnected?.(() => setCallStatus("ended"));
      widget.onCallEnd?.(() => setCallStatus("ended"));
      widget.onError?.((err) => {
        setError(err?.message || "Web call failed.");
        setCallStatus("error");
      });

      await widget.start();
      setCallStatus((current) => (current === "connecting" ? "connected" : current));
    } catch (err) {
      setError(err.message || "Web call failed.");
      setCallStatus("error");
    }
  }

  async function endWebCall() {
    await window.DograhWidget?.end?.();
    setCallStatus("ended");
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
          onCall={startWebCall}
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
          onCall={startWebCall}
          onBook={() => setView("booking")}
          showAppointment={showAppointment}
          showVoiceCall={showVoiceCall}
          quickTopics={quickTopics}
          onSuggestion={(prompt) => sendChatText(prompt)}
        />
      )}
      {view === "call" && (
        <CallView profile={profile} status={callStatus} error={error} onBack={() => setView("landing")} onEnd={endWebCall} onRetry={startWebCall} onChat={() => openChat()} onBook={() => setView("booking")} />
      )}
      {view === "booking" && (
        <Booking profile={profile} agent={agent} onBack={() => setView("landing")} onChat={() => openChat()} />
      )}
    </main>
  );
}

function TopBar({ profile, view, onHome }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#d8e4f5] bg-[#ffffff]/85 backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-[1180px] items-center gap-3 px-4 sm:px-6">
        <button onClick={onHome} className="flex min-w-0 items-center gap-2.5 text-left" aria-label="Home">
          <Robot size={34} src={profile.agentImageUrl || profile.logoUrl} glow={false} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-extrabold">{profile.title}</span>
            <span className="block truncate text-[11.5px] text-[#64748b]">{profile.category} Â· {profile.availability}</span>
          </span>
        </button>
        <div className="ml-auto flex items-center gap-3">
          {view !== "landing" && (
            <button onClick={onHome} className="vf-btn vf-btn-ghost px-3 py-2 text-[13.5px]">
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Home</span>
            </button>
          )}
          <span className="hidden items-center gap-1.5 text-xs font-semibold text-[#64748b] md:inline-flex">
            <GreenDot /> Online now
          </span>
        </div>
      </div>
    </header>
  );
}

function Landing({ profile, showBusinessInfo, showAppointment, showVoiceCall, quickTopics, onStart, onBook, onCall, onTile }) {
  return (
    <div className="vf-enter mx-auto w-full max-w-[1060px] px-5 py-8 sm:py-12">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.92fr)] lg:items-center lg:gap-10">
        <section className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <AiPill />
          <div className="my-2">
            <Robot size={248} src={profile.agentImageUrl} glow float />
          </div>
          <h1 className="text-[clamp(38px,6vw,60px)] font-black leading-[1.03] tracking-normal">{profile.title}</h1>
          <p className="mt-4 max-w-[460px] text-base leading-relaxed text-[#64748b] sm:text-[17px]">{profile.subtitle}</p>
        </section>

        <section className="flex flex-col gap-5">
          {showBusinessInfo && (
            <div className="vf-glass rounded-[22px] px-5 py-2">
              <InfoRow icon={Building2} label="Business" value={profile.businessName} first />
              <InfoRow icon={BookOpen} label="Category" value={profile.category} />
              <InfoRow icon={MapPin} label="Location" value={profile.location} />
              <InfoRow label="Availability" value={profile.availability} dot />
              <InfoRow icon={Zap} label="Response Time" value={profile.responseTime} />
            </div>
          )}
          <div className="flex w-full flex-col gap-3">
            <button className="vf-btn vf-btn-primary w-full px-5 py-4" onClick={onStart}>
              <MessageCircle size={19} /> {profile.cta} <ArrowRight size={18} className="ml-auto" />
            </button>
            <div className="flex flex-wrap gap-3">
              {showAppointment && (
                <button className="vf-btn vf-btn-ghost flex-1 px-4 py-3.5" onClick={onBook}>
                  <CalendarDays size={18} /> {profile.secondaryCta}
                </button>
              )}
              {showVoiceCall && (
                <button className="vf-btn vf-btn-soft flex-1 px-4 py-3.5" onClick={onCall} title="Start a voice call">
                  <Headphones size={18} /> {profile.voiceCta}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="mt-7">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold tracking-normal text-[#64748b]">QUICK TOPICS</h2>
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2563eb]">
            Tap to ask <ArrowRight size={15} />
          </span>
        </div>
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          {quickTopics.map((cat, index) => (
            <CategoryTile key={cat.id || index} cat={cat} onClick={onTile} />
          ))}
        </div>
      </section>
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

function CallView({ profile, status, error, onBack, onEnd, onRetry, onChat, onBook }) {
  const isLive = status === "connected";
  const isEnded = status === "ended";
  const isError = status === "error";
  const displayImage = profile.agentImageUrl || profile.logoUrl;

  return (
    <div className="vf-enter grid w-full place-items-center px-4 py-5 sm:px-5 sm:py-7">
      <div className="vf-glass flex min-h-[min(720px,calc(100vh-104px))] w-full max-w-[560px] flex-col items-center overflow-hidden rounded-[28px] px-6 py-8 text-center sm:px-10">
        {!isEnded && !isError ? (
          <>
            <div className="flex items-center gap-2 text-[12.5px] font-bold tracking-[.08em] text-[#64748b]">
              <GreenDot /> {isLive ? "LIVE VOICE CALL" : "CONNECTING..."}
            </div>

            <div className="relative my-6 grid h-[260px] w-[260px] place-items-center">
              {!isLive && (
                <>
                  <span className="vf-pulse-ring" />
                  <span className="vf-pulse-ring vf-d2" />
                  <span className="vf-pulse-ring vf-d3" />
                </>
              )}

              <Robot
                size={isLive ? 210 : 200}
                src={displayImage}
                glow
                float={isLive}
              />
            </div>

            <h1 className="text-2xl font-extrabold tracking-normal">{profile.title}</h1>

            <p className="mt-2 text-[15px] text-[#64748b]">
              {isLive ? "Private voice line is active." : "Securing a private line..."}
            </p>

            {error && (
              <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {error}
              </p>
            )}

            {isLive && (
              <div className="vf-eq mt-5">
                {Array.from({ length: 9 }).map((_, index) => (
                  <span key={index} />
                ))}
              </div>
            )}

            <div className="mt-auto flex items-center justify-center gap-3.5 pt-7">
              {isLive && (
                <button className="vf-btn vf-btn-ghost h-[58px] w-[58px] rounded-full p-0" aria-label="Mute">
                  <Mic size={22} />
                </button>
              )}

              <button
                className="grid h-16 w-16 place-items-center rounded-full bg-rose-600 text-white shadow-pop"
                onClick={isLive ? onEnd : onBack}
                aria-label="End call"
              >
                <PhoneOff size={24} />
              </button>

              {isLive && (
                <button className="vf-btn vf-btn-ghost h-[58px] w-[58px] rounded-full p-0" onClick={onBook} aria-label="Book">
                  <CalendarDays size={22} />
                </button>
              )}
            </div>
          </>
        ) : isError ? (
          <div className="vf-enter my-auto flex w-full flex-col items-center">
            <span className="grid h-[76px] w-[76px] place-items-center rounded-full bg-rose-50 text-rose-700">
              <PhoneOff size={34} />
            </span>

            <h1 className="mt-5 text-[26px] font-extrabold tracking-normal">Call could not start</h1>

            <p className="mt-1.5 max-w-sm text-[15px] text-[#64748b]">
              {error || "Please allow microphone access and try again."}
            </p>

            <div className="mt-6 flex w-full flex-col gap-3">
              <button className="vf-btn vf-btn-primary w-full p-4" onClick={onRetry}>
                <Headphones size={17} /> Try web call again
              </button>

              <div className="flex gap-3">
                <button className="vf-btn vf-btn-ghost flex-1 p-3" onClick={onChat}>
                  <MessageCircle size={17} /> Chat
                </button>

                <button className="vf-btn vf-btn-ghost flex-1 p-3" onClick={onBack}>
                  <ArrowLeft size={17} /> Home
                </button>
              </div>

              <button className="vf-btn vf-btn-ghost w-full p-3" onClick={onBook}>
                <CalendarDays size={17} /> Book appointment
              </button>
            </div>
          </div>
        ) : (
          <div className="vf-enter my-auto flex w-full flex-col items-center">
            <span className="grid h-[76px] w-[76px] place-items-center rounded-full bg-[#dbeafe] text-[#1d4ed8]">
              <Check size={36} strokeWidth={2.6} />
            </span>

            <h1 className="mt-5 text-[26px] font-extrabold tracking-normal">Call ended</h1>

            <p className="mt-1.5 text-[15px] text-[#64748b]">
              with {profile.title}
            </p>

            <div className="mt-6 flex w-full flex-col gap-3">
              <button className="vf-btn vf-btn-primary w-full p-4" onClick={onBook}>
                <CalendarDays size={18} /> Book a counselling session
              </button>

              <div className="flex gap-3">
                <button className="vf-btn vf-btn-ghost flex-1 p-3" onClick={onChat}>
                  <MessageCircle size={17} /> Chat
                </button>

                <button className="vf-btn vf-btn-ghost flex-1 p-3" onClick={onBack}>
                  <ArrowLeft size={17} /> Home
                </button>
              </div>
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
  return (
    <button onClick={() => onClick(cat)} className="vf-card-solid vf-tile flex min-h-[178px] flex-col rounded-[22px] p-5 text-left">
      <span className="vf-icon-orb mb-4 h-[54px] w-[54px] overflow-hidden rounded-full" style={{ background: `${cat.color || "#2563EB"}18`, color: cat.color || "#2563EB" }}>
        <TopicIcon topic={cat} size={24} />
      </span>
      <span className="text-[17px] font-extrabold tracking-normal">{cat.title}</span>
      <span className="mt-1.5 text-[13.5px] leading-snug text-[#64748b]">{cat.description}</span>
      <span className="mt-auto inline-flex pt-4" style={{ color: cat.color || "#2563EB" }}><ArrowRight size={18} /></span>
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
    <div className={`flex items-center gap-3.5 py-3.5 ${first ? "" : "border-t border-[#d8e4f5]"}`}>
      <span className="vf-icon-orb h-[38px] w-[38px] rounded-xl">{dot ? <GreenDot /> : <Icon size={18} />}</span>
      <span className="text-[15px] font-medium text-[#64748b]">{label}</span>
      <span className="ml-auto text-right text-[15px] font-bold">{value}</span>
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
.vf-eq{display:flex;align-items:center;gap:5px;height:38px}.vf-eq span{width:6px;border-radius:99px;background:var(--accent);animation:vfEq .9s ease-in-out infinite}.vf-eq span:nth-child(odd){height:24px}.vf-eq span:nth-child(even){height:34px;animation-delay:.16s}
@keyframes vfFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}@keyframes vfReact{0%,100%{transform:translateY(0) rotate(0)}35%{transform:translateY(-6px) rotate(-2deg)}70%{transform:translateY(2px) rotate(2deg)}}@keyframes vfViewIn{from{transform:translateY(12px)}to{transform:none}}@keyframes vfPulseRing{from{transform:scale(.6);opacity:.8}to{transform:scale(2.3);opacity:0}}@keyframes vfTyping{0%,80%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}@keyframes vfPulseScale{from{transform:scale(.7);opacity:.7}to{transform:scale(1.35);opacity:0}}@keyframes vfEq{0%,100%{transform:scaleY(.5)}50%{transform:scaleY(1.15)}}
`;

