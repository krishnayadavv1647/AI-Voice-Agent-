import {
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Building2,
  Cable,
  CheckCircle2,
  ClipboardList,
  Clock,
  GitBranch,
  Headphones,
  HeartPulse,
  HelpCircle,
  Landmark,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";

const problems = [
  "Missed calls after working hours",
  "Reception staff overload",
  "Slow lead response",
  "Repeated customer questions",
  "Manual appointment booking",
  "No call analytics"
];

const solutions = [
  { title: "Answer Calls 24/7", text: "Let AI respond instantly, even when your team is busy or offline.", icon: Clock },
  { title: "Qualify Leads Automatically", text: "Ask the right questions and capture intent, budget, phone, and next steps.", icon: ClipboardList },
  { title: "Automate Appointments & Follow-ups", text: "Collect preferred dates, times, requirements, and handoff details.", icon: RefreshCw }
];

const features = [
  { title: "AI Voice Agent Builder", text: "Create custom AI agents with prompts, first messages, behavior rules, language, and voice settings.", icon: Bot },
  { title: "Telephony Configuration", text: "Connect Twilio, Exotel, or Vonage directly from your app and link numbers to agents.", icon: PhoneCall },
  { title: "Workflow Automation", text: "Build call flows with nodes for questions, conditions, lead capture, API calls, transfers, and call endings.", icon: Workflow },
  { title: "Lead Management", text: "Automatically capture customer details, interests, phone numbers, appointment requests, and call summaries.", icon: ClipboardList },
  { title: "Provider Flexibility", text: "Use your own custom agent engine, or optionally sync with Dograh or Vapi when needed.", icon: Cable },
  { title: "Test Chat & Agent Preview", text: "Test agent conversations before connecting them to real phone calls.", icon: MessageSquare },
  { title: "Call Analytics", text: "Track call status, lead quality, appointment intent, call outcomes, and agent performance.", icon: BarChart3 },
  { title: "Human Handoff", text: "Transfer calls to a real person when the AI detects urgent or complex cases.", icon: Users }
];

const useCases = [
  { title: "Hospital Receptionist", text: "Handles appointments, doctor availability, patient details, and basic FAQs.", icon: HeartPulse },
  { title: "Real Estate Sales Agent", text: "Qualifies buyers, asks budget/location, collects leads, and schedules site visits.", icon: Building2 },
  { title: "Loan Assistant", text: "Asks loan amount, income, employment type, and explains next steps.", icon: Landmark },
  { title: "Salon Booking Agent", text: "Books appointments, shares service details, and confirms customer preferences.", icon: Scissors },
  { title: "Coaching Inquiry Agent", text: "Answers course questions, collects student details, and schedules counseling calls.", icon: Brain },
  { title: "Customer Support Agent", text: "Handles FAQs, collects issue details, and transfers complex queries.", icon: Headphones }
];

const integrations = ["Twilio", "Exotel", "Vonage", "Dograh", "Vapi", "OpenAI", "Gemini", "WhatsApp", "Google Sheets / CRM"];

const platformCards = [
  "Your database is the source of truth",
  "Dograh/Vapi are optional providers",
  "Telephony is configured inside your app",
  "Agents can run from your own custom engine"
];

const faqs = [
  ["Does this app need Dograh?", "No. Dograh is optional. You can run agents using the custom engine."],
  ["Can I connect my own phone provider?", "Yes. You can configure Twilio, Exotel, or Vonage."],
  ["Can AI answer real phone calls?", "Yes, once telephony webhook and phone provider are connected."],
  ["Can I use this for hospitals or real estate?", "Yes. You can create custom agents for different industries."],
  ["Can I test my agent before going live?", "Yes. Use the test chat/preview feature."]
];

export default function Welcome() {
  const { user } = useAuth();
  const startPath = user ? "/dashboard" : "/signup";

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.14),transparent_30rem),radial-gradient(circle_at_top_right,rgba(124,58,237,0.12),transparent_28rem)]" />

      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-sm">
              <Headphones size={22} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold">AI Voice Agent Platform</span>
              <span className="block truncate text-xs text-slate-500">Independent AI calling platform</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 lg:flex">
            <a href="#features" className="hover:text-brand-700">Features</a>
            <a href="#how-it-works" className="hover:text-brand-700">How It Works</a>
            <a href="#use-cases" className="hover:text-brand-700">Use Cases</a>
            <a href="#integrations" className="hover:text-brand-700">Integrations</a>
            <a href="#faq" className="hover:text-brand-700">FAQ</a>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link className="btn-secondary px-3 sm:px-4" to="/login">Login</Link>
            <Link className="btn-primary px-3 sm:px-4" to={startPath}>Get Started</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)] lg:px-8 lg:py-20 lg:items-center">
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap gap-2">
            {["No-code agent builder", "Telephony ready", "Dograh & Vapi optional", "Built for real business calls"].map((badge) => (
              <span key={badge} className="rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm">
                {badge}
              </span>
            ))}
          </div>
          <h1 className="max-w-4xl text-4xl font-black leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Build AI Voice Agents That Handle Calls Automatically
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
            Create intelligent AI agents that answer calls, qualify leads, book appointments, collect customer details, and automate conversations directly from your own dashboard.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link className="btn-primary" to={startPath}>Get Started <ArrowRight size={18} /></Link>
            <a className="btn-secondary" href="#dashboard-preview">View Demo</a>
          </div>
        </div>

        <HeroMockup />
      </section>

      <section className="border-y border-slate-200 bg-white/80 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionHeader eyebrow="The problem" title="Businesses Lose Customers Because Calls Are Missed" text="Every missed call can be a missed lead, appointment, or sale. Your AI voice agent helps businesses respond instantly, 24/7." />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {problems.map((problem) => (
              <div key={problem} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <CheckCircle2 className="mb-4 text-rose-500" size={21} />
                <p className="font-semibold text-slate-800">{problem}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionHeader eyebrow="The solution" title="Your AI Receptionist, Sales Assistant, and Support Agent in One Platform" text="AI answers calls, asks customer questions, qualifies leads, books appointments, saves details, transfers to humans when needed, and works with telephony providers." />
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {solutions.map((solution) => <InfoCard key={solution.title} {...solution} />)}
          </div>
        </div>
      </section>

      <section id="features" className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionHeader eyebrow="Core features" title="Everything You Need to Build AI Call Agents" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => <InfoCard key={feature.title} {...feature} compact />)}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionHeader eyebrow="How it works" title="Launch an AI Call Agent in 3 Steps" />
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {[
              ["01", "Create Your Agent", "Add agent name, system prompt, first message, voice, language, and behavior rules."],
              ["02", "Connect Telephony", "Add Twilio, Exotel, or Vonage configuration and link a phone number to your agent."],
              ["03", "Start Handling Calls", "Incoming calls hit your backend, run your AI agent, and return smart voice responses."]
            ].map(([number, title, text]) => (
              <article key={number} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 text-sm font-black text-brand-600">{number}</div>
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="use-cases" className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionHeader eyebrow="Use cases" title="Built for Businesses That Depend on Calls" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map((item) => <InfoCard key={item.title} {...item} />)}
          </div>
        </div>
      </section>

      <section id="integrations" className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionHeader eyebrow="Integrations" title="Connect With the Tools You Already Use" text="Dograh and Vapi are optional providers. Your app remains the source of truth." />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {integrations.map((integration) => (
              <div key={integration} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center text-sm font-bold text-slate-700 shadow-sm">
                {integration}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionHeader dark eyebrow="Platform control" title="Not Just a Wrapper - Your Own AI Voice Agent Platform" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {platformCards.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-5">
                <ShieldCheck className="mb-4 text-emerald-300" size={22} />
                <p className="font-semibold text-slate-100">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="dashboard-preview" className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <SectionHeader eyebrow="Dashboard preview" title="Manage Agents, Leads, Calls, and Telephony From One Dashboard" />
          <DashboardPreview />
        </div>
      </section>

      <section id="faq" className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <SectionHeader eyebrow="FAQ" title="Common Questions" />
          <div className="mt-8 grid gap-4">
            {faqs.map(([question, answer]) => (
              <article key={question} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex gap-3">
                  <HelpCircle className="mt-0.5 shrink-0 text-brand-600" size={20} />
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-950">{question}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{answer}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-soft sm:p-10">
          <Sparkles className="mx-auto mb-4 text-brand-600" size={28} />
          <h2 className="text-3xl font-black tracking-tight text-slate-950">Start Building Your AI Voice Agent Today</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Create, test, connect, and launch AI agents that handle business calls automatically.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link className="btn-primary" to={startPath}>Get Started</Link>
            <Link className="btn-secondary" to="/login">Login</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function SectionHeader({ eyebrow, title, text, dark = false }) {
  return (
    <div className="min-w-0">
      <p className={`text-sm font-bold uppercase tracking-[0.22em] ${dark ? "text-brand-200" : "text-brand-700"}`}>{eyebrow}</p>
      <h2 className={`mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl ${dark ? "text-white" : "text-slate-950"}`}>{title}</h2>
      {text && <p className={`mt-3 max-w-2xl text-sm leading-6 ${dark ? "text-slate-300" : "text-slate-600"}`}>{text}</p>}
    </div>
  );
}

function InfoCard({ title, text, icon: Icon, compact = false }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        <Icon size={21} />
      </div>
      <h3 className="text-base font-bold text-slate-950">{title}</h3>
      <p className={`mt-2 text-sm leading-6 text-slate-600 ${compact ? "line-clamp-none" : ""}`}>{text}</p>
    </article>
  );
}

function HeroMockup() {
  return (
    <div className="min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-soft">
      <div className="rounded-[1.5rem] bg-slate-950 p-4 text-white">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-200">Live call</p>
            <h2 className="text-lg font-bold">Clinic Reception Agent</h2>
          </div>
          <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">Connected</span>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_0.85fr]">
          <div className="rounded-2xl bg-white p-4 text-slate-950">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">AI agent response</p>
            <p className="mt-2 text-sm leading-6">“Sure, I can help book an appointment. May I know your name and preferred time?”</p>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 px-3 py-2"><strong>Lead:</strong> Rahul Sharma</div>
              <div className="rounded-xl bg-slate-50 px-3 py-2"><strong>Intent:</strong> Appointment booking</div>
              <div className="rounded-xl bg-slate-50 px-3 py-2"><strong>Status:</strong> Qualified</div>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-300">Workflow nodes</p>
              {["Start Call", "Ask Questions", "Capture Lead", "Human Handoff"].map((node) => (
                <div key={node} className="mb-2 rounded-xl bg-white/10 px-3 py-2 text-sm last:mb-0">{node}</div>
              ))}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-300">Providers</p>
              <div className="flex flex-wrap gap-2">
                {["Twilio", "Exotel", "Vonage"].map((name) => (
                  <span key={name} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-800">{name}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-bold text-slate-950">Agent list</h3>
          <span className="badge bg-emerald-50 text-emerald-700">3 Active</span>
        </div>
        {["Reception Agent", "Sales Agent", "Support Agent"].map((agent) => (
          <div key={agent} className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 last:mb-0">
            <span className="font-semibold text-slate-800">{agent}</span>
            <span className="text-sm text-slate-500">Connected</span>
          </div>
        ))}
      </div>
      <div className="grid gap-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-950">Telephony config</h3>
          <div className="flex flex-wrap gap-2">
            {["Twilio active", "Webhook ready", "Provider synced"].map((item) => (
              <span key={item} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">{item}</span>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-bold text-slate-950">Lead table</h3>
          <div className="grid gap-2 text-sm text-slate-600">
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2"><span>Rahul</span><span>Booked</span><span>2m call</span></div>
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2"><span>Priya</span><span>New</span><span>Callback</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
