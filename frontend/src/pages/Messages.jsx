import { MessageSquare, Send } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import EmptyState from "../components/EmptyState.jsx";

export default function Messages() {
  return (
    <>
      <PageHeader title="Messages" description="Review web chat tests and AI message conversations powered by Gemini." />
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="card">
          <h2 className="panel-title">Conversations</h2>
          <div className="mt-4 space-y-3">
            {["Restaurant Booking agent", "Clinic Reception Agent", "Support Agent"].map((name) => (
              <button key={name} className="w-full rounded-2xl border border-slate-200 p-3 text-left hover:bg-slate-50">
                <p className="font-semibold text-slate-950">{name}</p>
                <p className="text-sm text-slate-500">No recent message</p>
              </button>
            ))}
          </div>
        </aside>
        <section className="card min-h-[520px]">
          <div className="mb-4 flex items-center gap-3">
            <div className="icon-tile"><MessageSquare size={18} /></div>
            <div>
              <h2 className="panel-title">Message Test Inbox</h2>
              <p className="muted">Chat history will appear here when message logging is enabled.</p>
            </div>
          </div>
          <EmptyState title="No message conversations yet" description="Use Message Test inside an agent profile to start a Gemini-powered chat." />
          <div className="mt-6 flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <input className="border-0 bg-transparent focus:ring-0" placeholder="Select an agent conversation first..." disabled />
            <button className="btn-primary" disabled><Send size={16} />Send</button>
          </div>
        </section>
      </div>
    </>
  );
}
