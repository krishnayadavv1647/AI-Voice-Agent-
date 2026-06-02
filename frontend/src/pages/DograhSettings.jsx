import { CheckCircle2, KeyRound, RadioTower, RefreshCw, Workflow } from "lucide-react";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

export default function DograhSettings() {
  return (
    <>
      <PageHeader title="Dograh Settings" description="Verify Dograh API connectivity, workflow creation settings, caller ID, and manual workflow connection defaults." />
      <div className="grid gap-6 xl:grid-cols-3">
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
          <p className="muted mt-2">Use retries only when Dograh workflow creation fails for an individual agent.</p>
          <button className="btn-secondary mt-5 w-full"><RefreshCw size={16} />Retry Workflow Creation</button>
        </aside>

        <section className="card xl:col-span-3">
          <h2 className="panel-title">Manual Workflow Connect</h2>
          <p className="muted mt-1">Fallback for connecting an existing Dograh workflow UUID to a local app agent.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input placeholder="Workflow ID" />
            <input placeholder="Workflow UUID" />
            <input placeholder="Caller ID number" />
            <button className="btn-primary">Connect Workflow</button>
          </div>
        </section>
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
