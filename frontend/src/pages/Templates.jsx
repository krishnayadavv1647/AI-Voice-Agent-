import { Bot, Building2, Bus, HeartPulse, Hotel, Landmark, Scissors, Utensils } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";

const templates = [
  ["Restaurant Booking Agent", "Handle reservations, menu questions, takeaway inquiries, and guest details.", Utensils],
  ["Bank Loan Agent", "Qualify loan inquiries, capture income range, requirement, and callback details.", Landmark],
  ["Clinic Reception Agent", "Collect appointment requests with safe healthcare call behavior.", HeartPulse],
  ["Bus Ticket Booking Agent", "Capture route, date, passengers, bus type, and travel timing.", Bus],
  ["Real Estate Lead Agent", "Qualify buyer or rental requirements and schedule follow-up.", Building2],
  ["Salon Booking Agent", "Book beauty and grooming appointments with preferred timing.", Scissors],
  ["Hotel Booking Agent", "Capture room booking requests, dates, guests, and room type.", Hotel],
  ["Customer Support Agent", "Log issues, answer FAQs, and collect escalation details.", Bot]
];

export default function Templates() {
  return (
    <div className="page-stack">
      <PageHeader title="Templates" description="Start faster with prebuilt outbound AI agent templates for common business workflows." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {templates.map(([title, description, Icon]) => (
          <article key={title} className="card flex min-w-0 flex-col">
            <div className="icon-tile mb-4"><Icon size={20} /></div>
            <h2 className="break-anywhere text-lg font-semibold text-ink">{title}</h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-neutral-500">{description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link className="btn-primary" to="/create-agent">Use Template</Link>
              <Link className="btn-secondary" to="/create-agent">Preview</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
