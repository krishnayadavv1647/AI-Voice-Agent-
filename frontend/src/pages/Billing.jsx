import { CreditCard } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";

const plans = [
  ["Free Trial", "1 agent", "30 minutes", "Basic call logs"],
  ["Starter", "1 agent", "100 minutes/month", "Basic lead capture"],
  ["Pro", "5 agents", "500 minutes/month", "Advanced call logs", "Lead management"],
  ["Agency", "20 agents", "2000 minutes/month", "Client management coming soon"]
];

export default function Billing() {
  return (
    <div className="page-stack">
      <PageHeader title="Billing" description="Razorpay and Stripe-ready structure. Payments are not enabled yet." />
      <div className="grid gap-4 lg:grid-cols-4">
        {plans.map(([name, ...features]) => (
          <div key={name} className="card flex flex-col">
            <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700">
              <CreditCard size={18} />
            </div>
            <h2 className="text-lg font-semibold text-ink">{name}</h2>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-neutral-600">
              {features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <button className="btn-primary mt-6" onClick={() => alert("Payment integration is not enabled yet.")}>Upgrade</button>
          </div>
        ))}
      </div>
    </div>
  );
}
