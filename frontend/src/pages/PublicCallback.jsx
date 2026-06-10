import { CheckCircle2, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.js";

export default function PublicCallback() {
  const { agentId } = useParams();
  const [form, setForm] = useState({ name: "", phoneNumber: "", requirement: "", preferredTime: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function requestCall(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await api(`/public/agents/${agentId}/request-call`, { method: "POST", auth: false, body: form });
      setMessage(result.message || "AI assistant is calling you now.");
    } catch (err) {
      setError(err.response ? `${err.message}` : err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 px-4 py-8 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.35),transparent_32rem),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.25),transparent_28rem)]" />
      <section className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl place-items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1fr)] lg:items-center">
          <div className="min-w-0">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-blue-100">
              <Sparkles size={15} />
              Secure AI callback
            </div>
            <h1 className="break-anywhere text-4xl font-bold tracking-tight md:text-5xl">Talk to AI Assistant</h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-slate-300">Enter your phone number and our AI assistant will call you.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {["Secure call", "No spam", "Business callback"].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-slate-200">
                  <ShieldCheck className="mb-2 text-emerald-300" size={20} />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <form className="w-full rounded-3xl border border-white/10 bg-white p-6 text-slate-950 shadow-2xl" onSubmit={requestCall}>
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                <PhoneCall size={22} />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Call Me Now</h2>
                <p className="text-sm text-slate-500">The AI assistant will call your number.</p>
              </div>
            </div>

            {message && <div className="mb-4 flex gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 size={18} />{message}</div>}
            {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

            <div className="space-y-4">
              <Label text="Name"><input value={form.name} onChange={(event) => setField("name", event.target.value)} /></Label>
              <Label text="Phone Number"><input required placeholder="+918000281647" value={form.phoneNumber} onChange={(event) => setField("phoneNumber", event.target.value)} /></Label>
              <Label text="Requirement"><textarea required value={form.requirement} onChange={(event) => setField("requirement", event.target.value)} /></Label>
              <Label text="Preferred Time optional"><input value={form.preferredTime} onChange={(event) => setField("preferredTime", event.target.value)} /></Label>
              <button className="btn-primary w-full justify-center" disabled={loading}>
                <PhoneCall size={16} />
                {loading ? "Starting call..." : "Call Me Now"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

function Label({ text, children }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {text}
      <div className="mt-1">{children}</div>
    </label>
  );
}
