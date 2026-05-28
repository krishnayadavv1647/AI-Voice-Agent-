import { Bot } from "lucide-react";
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
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-brand-600 text-white">
            <Bot size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">AI Voice Agent</h1>
            <p className="text-sm text-slate-500">Create Dograh-powered agents</p>
          </div>
        </div>
        <form onSubmit={submit} className="card space-y-4">
          <div>
            <h2 className="text-lg font-bold text-ink">{isSignup ? "Create your account" : "Welcome back"}</h2>
            <p className="text-sm text-slate-500">{isSignup ? "Start building custom voice agents." : "Sign in to your dashboard."}</p>
          </div>
          {isSignup && (
            <label className="block text-sm font-medium text-slate-700">
              Full name
              <input className="mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
          )}
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input className="mt-1" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input className="mt-1" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          </label>
          {isSignup && (
            <label className="block text-sm font-medium text-slate-700">
              Confirm password
              <input className="mt-1" type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required />
            </label>
          )}
          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <button className="btn-primary w-full" disabled={loading}>{loading ? "Please wait..." : isSignup ? "Sign up" : "Log in"}</button>
          <p className="text-center text-sm text-slate-500">
            {isSignup ? "Already have an account?" : "New here?"}{" "}
            <Link className="font-semibold text-brand-700" to={isSignup ? "/login" : "/signup"}>
              {isSignup ? "Log in" : "Create account"}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
