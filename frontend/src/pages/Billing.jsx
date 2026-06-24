import { Check, Coins, CreditCard, Sparkles, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../state/AuthContext.jsx";
import { useCredits } from "../state/CreditsContext.jsx";

const FEATURE_LABELS = {
  voice_call: "Voice calls",
  email_send: "Email campaigns",
  lead_search: "Lead Finder",
  appointment_book: "Appointments",
  image_generate: "Agent images"
};

const PLAN_ICON = { starter: Coins, growth: Zap, scale: Sparkles };

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function Billing() {
  const { user } = useAuth();
  const { refresh } = useCredits();
  const [data, setData] = useState(null);
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    load();
    if (new URLSearchParams(window.location.search).get("checkout") === "success") {
      setMessage("Payment successful! Your credits have been added.");
      refresh();
    }
  }, []);

  async function load() {
    try {
      const result = await api("/billing/plans");
      setData(result);
    } catch (err) {
      setError(err.response?.message || err.message);
    }
  }

  const symbol = data?.provider === "stripe" ? "$" : "₹";
  const priceField = data?.provider === "stripe" ? "priceUsd" : "priceInr";

  async function checkout(type, key) {
    setBusyKey(key);
    setMessage("");
    setError("");
    try {
      const result = await api("/billing/checkout", { method: "POST", body: { type, key } });
      const cp = result.clientPayload;

      if (result.provider === "razorpay") {
        const ready = await loadRazorpay();
        if (!ready) throw new Error("Could not load the payment window. Check your connection.");
        const rzp = new window.Razorpay({
          key: cp.keyId,
          order_id: cp.orderId,
          amount: cp.amount,
          currency: cp.currency,
          name: "AI Voice Agent",
          description: type === "plan" ? `${key} plan` : "Credit top-up",
          prefill: { email: user?.email, name: user?.name },
          theme: { color: "#111111" },
          handler: async (resp) => {
            try {
              await api("/billing/verify", {
                method: "POST",
                body: {
                  razorpay_order_id: resp.razorpay_order_id,
                  razorpay_payment_id: resp.razorpay_payment_id,
                  razorpay_signature: resp.razorpay_signature
                }
              });
              setMessage("Payment successful! Your credits have been added.");
              await Promise.all([load(), refresh()]);
            } catch (err) {
              setError(err.response?.message || err.message);
            }
          }
        });
        rzp.open();
      } else if (result.provider === "stripe") {
        window.location.href = cp.url;
      }
    } catch (err) {
      setError(err.response?.message || err.message);
    } finally {
      setBusyKey("");
    }
  }

  const plans = data?.plans || [];
  const packs = data?.topupPacks || [];
  const currentPlan = data?.planStatus === "active" ? data?.currentPlan : null;

  return (
    <div className="page-stack">
      <PageHeader title="Plans & Billing" description="Choose a plan to unlock features and get credits, or top up credits anytime. Credits are consumed as you use calls, email, and more." />

      {error && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {message && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-neutral-50 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Current plan</p>
          <p className="text-lg font-semibold text-ink">{currentPlan ? currentPlan : "No active plan"}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Credit balance</p>
          <p className="text-lg font-semibold text-ink">{(data?.balance ?? 0).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const Icon = PLAN_ICON[plan.key] || CreditCard;
          const isCurrent = currentPlan === plan.key;
          return (
            <div key={plan.key} className={`card flex flex-col ${isCurrent ? "ring-2 ring-ink" : ""}`}>
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon size={18} /></div>
              <h2 className="text-lg font-semibold text-ink">{plan.label}</h2>
              <p className="mt-1 text-2xl font-bold text-ink">{symbol}{plan[priceField]?.toLocaleString()}</p>
              <p className="mt-1 text-sm font-semibold text-brand-700">{plan.credits.toLocaleString()} credits</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-neutral-600">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check size={15} className="text-emerald-600" />{FEATURE_LABELS[f] || f}</li>
                ))}
              </ul>
              <button
                className="btn-primary mt-6"
                disabled={isCurrent || busyKey === plan.key}
                onClick={() => checkout("plan", plan.key)}
              >
                {isCurrent ? "Current plan" : busyKey === plan.key ? "Opening…" : "Choose plan"}
              </button>
            </div>
          );
        })}
      </div>

      <section className="card">
        <div className="mb-4 flex items-center gap-2">
          <Coins size={18} className="text-neutral-500" />
          <h2 className="panel-title">Top up credits</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {packs.map((pack) => (
            <div key={pack.key} className="rounded-xl border border-hairline p-4">
              <p className="text-base font-semibold text-ink">{pack.credits.toLocaleString()} credits</p>
              <p className="mt-1 text-sm text-neutral-600">{symbol}{pack[priceField]?.toLocaleString()}</p>
              <button className="btn-secondary mt-4 w-full" disabled={busyKey === pack.key} onClick={() => checkout("topup", pack.key)}>
                {busyKey === pack.key ? "Opening…" : "Buy"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
