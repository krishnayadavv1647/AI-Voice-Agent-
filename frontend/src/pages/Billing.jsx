import { Check, Coins, CreditCard, Sparkles, Zap } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

const TIER_ICON = { starter: Coins, growth: Zap, scale: Sparkles };

const CURRENCY_SYMBOLS = { USD: "$", INR: "₹", EUR: "€", GBP: "£" };
function currencySymbol(currency) {
  return CURRENCY_SYMBOLS[currency] ?? currency + " ";
}

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
  const queryClient = useQueryClient();
  // Catalog plans (new endpoint) and billing overview (topup packs + provider) run in parallel.
  const { data: catalogData, error: catalogError } = useQuery({
    queryKey: ["billing", "catalog"],
    queryFn: () => api("/plans")
  });
  const { data: billingData, error: billingError } = useQuery({
    queryKey: ["billing", "overview"],
    queryFn: () => api("/billing/plans")
  });
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const loadError = catalogError || billingError;
  const error = actionError || (loadError ? (loadError.response?.message || loadError.message) : "");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "success") {
      setMessage("Payment successful! Your credits have been added.");
      refresh();
    }
  }, []);

  function reloadBilling() {
    queryClient.invalidateQueries({ queryKey: ["billing"] });
  }

  async function checkout(type, key) {
    setBusyKey(key);
    setMessage("");
    setActionError("");
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
              reloadBilling();
              refresh();
            } catch (err) {
              setActionError(err.response?.message || err.message);
            }
          }
        });
        rzp.open();
      } else if (result.provider === "stripe") {
        window.location.href = cp.url;
      }
    } catch (err) {
      setActionError(err.response?.message || err.message);
    } finally {
      setBusyKey("");
    }
  }

  const plans = catalogData?.plans || [];
  const packs = billingData?.topupPacks || [];
  const currentPlanSlug = catalogData?.currentPlan || null;
  const planStatus = catalogData?.planStatus || "inactive";
  const currentPlan = planStatus === "active" ? currentPlanSlug : null;
  // Topup packs are shown in USD.
  const packSymbol = "$";
  const priceField = "priceUsd";

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
          <p className="text-lg font-semibold text-ink">{(catalogData?.balance ?? 0).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const Icon = TIER_ICON[plan.tier] || CreditCard;
          const isCurrent = plan.isCurrentPlan;
          const checkoutKey = plan.slug;
          const sym = currencySymbol(plan.pricing?.currency || "USD");
          const monthlyPrice = plan.pricing?.monthlyPrice;
          const credits = plan.monthlyCredits ?? 0;

          return (
            <div key={String(plan._id)} className={`card flex flex-col ${isCurrent ? "ring-2 ring-ink" : ""}`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon size={18} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {isCurrent && (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">Your Plan</span>
                  )}
                  {plan.isAssignedToYou && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">Custom plan for you</span>
                  )}
                  {plan.badge && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{plan.badge}</span>
                  )}
                </div>
              </div>

              <h2 className="text-lg font-semibold text-ink">{plan.name}</h2>
              {plan.description && <p className="mt-0.5 text-sm text-neutral-500">{plan.description}</p>}

              {plan.pricing?.isContactSales ? (
                <p className="mt-1 text-2xl font-bold text-ink">Contact Sales</p>
              ) : (
                <p className="mt-1 text-2xl font-bold text-ink">
                  {sym}{(monthlyPrice ?? 0).toLocaleString()}
                  <span className="text-sm font-normal text-neutral-500">/mo</span>
                </p>
              )}

              <p className="mt-1 text-sm font-semibold text-white">{credits.toLocaleString()} credits/mo</p>

              {plan.features?.length > 0 && (
                <ul className="mt-4 flex-1 space-y-2 text-sm text-neutral-600">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check size={15} className="text-emerald-600" />
                      {FEATURE_LABELS[f] || f}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6">
                {plan.pricing?.isContactSales ? (
                  <a href="mailto:support@aivoiceagent.com" className="btn-secondary block text-center">
                    Contact Sales
                  </a>
                ) : (
                  <button
                    className="btn-primary w-full"
                    disabled={isCurrent || busyKey === checkoutKey}
                    onClick={() => checkout("plan", checkoutKey)}
                  >
                    {isCurrent ? "Current plan" : busyKey === checkoutKey ? "Opening…" : "Choose plan"}
                  </button>
                )}
              </div>
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
              <p className="mt-1 text-sm text-neutral-600">{packSymbol}{pack[priceField]?.toLocaleString()}</p>
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
