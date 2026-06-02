import { Headphones } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_URL } from "../lib/api.js";
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

  function continueWithGoogle() {
    window.location.href = `${API_URL}/auth/google`;
  }

  return (
    <main className="grid min-h-screen overflow-x-hidden bg-slate-50 px-4 py-8 text-slate-950 sm:px-6">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.14),transparent_28rem),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.12),transparent_24rem)]" />

      <section className="mx-auto grid w-full max-w-md place-items-center">
        <div className="w-full">
          <Link to="/" className="mb-8 flex items-center justify-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-sm">
              <Headphones size={23} />
            </span>
            <span className="text-left">
              <span className="block text-lg font-bold">AI Voice Agent Platform</span>
              <span className="block text-xs text-slate-500">Calls, leads, and automation</span>
            </span>
          </Link>

          <form onSubmit={submit} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-black tracking-tight text-slate-950">
                {isSignup ? "Create your account" : "Welcome back"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {isSignup
                  ? "Start building AI voice agents in minutes."
                  : "Login to continue to your AI voice agent dashboard."}
              </p>
            </div>

            <div className="space-y-4">
              {isSignup && (
                <Label text="Name">
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required placeholder="Your name" />
                </Label>
              )}
              <Label text="Email">
                <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required placeholder="you@company.com" />
              </Label>
              <Label text="Password">
                <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required placeholder="Enter password" />
              </Label>
              {isSignup && (
                <Label text="Confirm password">
                  <input type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required placeholder="Confirm password" />
                </Label>
              )}

              {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

              <button className="btn-primary w-full py-3" disabled={loading}>
                {loading ? "Please wait..." : isSignup ? "Create account" : "Login"}
              </button>

              <button className="btn-secondary w-full justify-center py-3" type="button" disabled={loading} onClick={continueWithGoogle}>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-sm font-black text-brand-700">G</span>
                Continue with Google
              </button>

              <p className="text-center text-sm text-slate-500">
                {isSignup ? "Already have an account?" : "New here?"}{" "}
                <Link className="font-semibold text-brand-700 hover:text-brand-800" to={isSignup ? "/login" : "/signup"}>
                  {isSignup ? "Login" : "Sign up"}
                </Link>
              </p>
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
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
