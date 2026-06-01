import { Bot, CheckCircle2, Headphones } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";

export default function AuthPage({ mode }) {
  const isSignup = mode === "signup";
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (isSignup && form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      if (isSignup) await signup(form);
      else await login({ email: form.email, password: form.password });
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 px-4 py-8 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.35),transparent_30rem),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.25),transparent_28rem)]" />
      <section className="relative mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center">
        <div className="min-w-0">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600">
              <Headphones size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AI Voice Agent Platform</h1>
              <p className="text-sm text-slate-300">Dograh-powered outbound calling automation</p>
            </div>
          </div>
          <h2 className="max-w-2xl text-4xl font-bold tracking-tight md:text-6xl">Create AI calling agents that turn conversations into leads.</h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">Build agents, trigger Dograh + Twilio calls, sync recordings and transcripts, and extract leads using AI.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {["Outbound-first", "Gemini chat", "Dograh sync"].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-slate-200">
                <CheckCircle2 className="mb-2 text-emerald-300" size={20} />
                {item}
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="w-full rounded-3xl border border-white/10 bg-white p-6 text-slate-950 shadow-2xl">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-700">
              <Bot size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold">{isSignup ? "Create your account" : "Welcome back"}</h2>
              <p className="text-sm text-slate-500">{isSignup ? "Start building AI voice agents." : "Sign in to your dashboard."}</p>
            </div>
          </div>
          <div className="space-y-4">
            {isSignup && <Label text="Full name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Label>}
            <Label text="Email"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Label>
            <Label text="Password"><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></Label>
            {isSignup && <Label text="Confirm password"><input type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required /></Label>}
            {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
            <button className="btn-primary w-full" disabled={loading}>{loading ? "Please wait..." : isSignup ? "Sign up" : "Log in"}</button>
            <p className="text-center text-sm text-slate-500">
              {isSignup ? "Already have an account?" : "New here?"}{" "}
              <Link className="font-semibold text-brand-700" to={isSignup ? "/login" : "/signup"}>
                {isSignup ? "Log in" : "Create account"}
              </Link>
            </p>
          </div>
        </form>
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
