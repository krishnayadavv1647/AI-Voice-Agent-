import { CheckCircle2, KeyRound, RadioTower, RefreshCw, Workflow } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

export default function DograhSettings() {
  return (
    <>
      <PageHeader title="Dograh Settings" description="Verify Dograh API connectivity, automatic workflow creation settings, and caller ID defaults." />
      <div className="grid min-w-0 gap-5 xl:grid-cols-3 xl:gap-6">
        <section className="card xl:col-span-2">
          <h2 className="panel-title">API Connection</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Info icon={CheckCircle2} label="Dograh API Status" value="Connected" badge="Connected" />
            <Info icon={Workflow} label="Base URL" value="https://app.dograh.com/api/v1" />
            <Info icon={KeyRound} label="API Key" value="•••••••••••• connected" />
            <Info icon={RadioTower} label="Telephony Provider" value="twilio" />
          </div>
        </section>

        <aside className="card">
          <h2 className="panel-title">Workflow Operations</h2>
          <p className="muted mt-2">Dograh workflows are created automatically when an agent is created. Retry workflow sync from the agent details page if a specific agent fails.</p>
          <button className="btn-secondary mt-5 w-full" disabled><RefreshCw size={16} />Retry From Agent Details</button>
        </aside>
      </div>
    </>
  );
}

function Info({ icon: Icon, label, value, badge }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="icon-tile"><Icon size={18} /></div>
        {badge && <StatusBadge status={badge} />}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="break-anywhere mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
