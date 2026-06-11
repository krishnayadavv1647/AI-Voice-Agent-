import { CalendarClock, Pause, PhoneCall, Play, Plus, RefreshCw, RotateCcw, Square, Upload, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { API_URL, api, getToken } from "../lib/api.js";

const defaultForm = {
  name: "",
  agentId: "",
  startAt: "",
  timezone: "Asia/Kolkata",
  callingSpeed: { batchSize: 5, delaySeconds: 10, maxParallelCalls: 3 },
  retryRules: { enabled: true, maxAttempts: 3, retryDelayMinutes: 120, retryOnStatuses: ["no_answer", "busy", "failed", "declined"] }
};

function errorText(err) {
  return err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message;
}

function fmt(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function leadName(lead) {
  return lead?.businessName || lead?.contactName || lead?.name || lead?.phone || "Lead";
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [agents, setAgents] = useState([]);
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [file, setFile] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedStats = selected?.stats || {};
  const filteredLeads = useMemo(() => leads.filter((lead) => !form.agentId || lead.agentId === form.agentId || lead.agentId?._id === form.agentId), [leads, form.agentId]);

  async function load() {
    setError("");
    const [campaignData, agentData] = await Promise.all([api("/campaigns"), api("/agents")]);
    setCampaigns(campaignData);
    setAgents(agentData);
    setForm((current) => ({ ...current, agentId: current.agentId || agentData[0]?._id || "" }));
  }

  async function loadLeads(agentId) {
    setLeads(await api(`/campaigns/lead-options${agentId ? `?agentId=${agentId}` : ""}`));
  }

  async function openCampaign(campaign) {
    setLoading(`open-${campaign._id}`);
    setError("");
    try {
      const [detail, recipientRows] = await Promise.all([
        api(`/campaigns/${campaign._id}`),
        api(`/campaigns/${campaign._id}/recipients`)
      ]);
      setSelected(detail);
      setRecipients(recipientRows);
      setShowCreate(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading("");
    }
  }

  useEffect(() => {
    load().catch((err) => setError(errorText(err)));
  }, []);

  useEffect(() => {
    if (showCreate || selected) loadLeads(form.agentId || selected?.agentId?._id || selected?.agentId).catch((err) => setError(errorText(err)));
  }, [showCreate, form.agentId, selected?._id]);

  async function createCampaign(event) {
    event.preventDefault();
    setLoading("create");
    setNotice("");
    setError("");
    try {
      const campaign = await api("/campaigns", { method: "POST", body: form });
      setNotice("Campaign created.");
      setShowCreate(false);
      setForm({ ...defaultForm, agentId: agents[0]?._id || "" });
      await load();
      await openCampaign(campaign);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading("");
    }
  }

  async function addSelectedLeads() {
    if (!selected || !selectedLeadIds.length) return;
    setLoading("add-leads");
    setNotice("");
    setError("");
    try {
      const result = await api(`/campaigns/${selected._id}/add-leads`, { method: "POST", body: { leadIds: selectedLeadIds } });
      setNotice(`${result.created} recipient${result.created === 1 ? "" : "s"} added.`);
      setSelectedLeadIds([]);
      await openCampaign(selected);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading("");
    }
  }

  async function importRecipients() {
    if (!selected || !file) return;
    setLoading("import");
    setNotice("");
    setError("");
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/campaigns/${selected._id}/import-recipients?fileName=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: {
          "Content-Type": file.name.toLowerCase().endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: await file.arrayBuffer()
      });
      const payload = await response.json();
      if (!response.ok) throw Object.assign(new Error(payload.message || "Import failed"), { response: payload });
      setNotice(`${payload.created} recipient${payload.created === 1 ? "" : "s"} imported. ${payload.skipped || 0} skipped.`);
      setFile(null);
      await openCampaign(selected);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading("");
    }
  }

  async function campaignAction(type) {
    if (!selected) return;
    if (type === "cancel" && !confirm("Cancel this campaign?")) return;
    setLoading(type);
    setNotice("");
    setError("");
    try {
      const result = await api(`/campaigns/${selected._id}/${type}`, { method: "POST" });
      setNotice(type === "retry-failed" ? `${result.queued || 0} recipients queued for retry.` : `Campaign ${type.replace("-", " ")} complete.`);
      await openCampaign(selected);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading("");
    }
  }

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Create bulk AI calling campaigns using your agents and leads."
        action={<div className="action-row"><button className="btn-secondary" onClick={() => load().catch((err) => setError(errorText(err)))}><RefreshCw size={16} />Refresh</button><button className="btn-primary" onClick={() => { setShowCreate(true); setSelected(null); }}><Plus size={16} />Create Campaign</button></div>}
      />
      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <section className="card p-0">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-bold text-slate-950">Call Campaigns</h2>
          </div>
          {!campaigns.length ? (
            <div className="p-5"><EmptyState title="No campaigns yet" description="Create a campaign to call leads in controlled batches." /></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {campaigns.map((campaign) => (
                <button key={campaign._id} className={`block w-full p-4 text-left transition hover:bg-slate-50 ${selected?._id === campaign._id ? "bg-brand-50" : ""}`} onClick={() => openCampaign(campaign)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-anywhere font-bold text-slate-950">{campaign.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{campaign.agentId?.agentName || "Agent"} · {fmt(campaign.startAt)}</p>
                    </div>
                    <StatusBadge status={campaign.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <Mini label="Total" value={campaign.stats?.totalRecipients || 0} />
                    <Mini label="Answered" value={campaign.stats?.answered || 0} />
                    <Mini label="Failed" value={campaign.stats?.failed || 0} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <main className="min-w-0">
          {showCreate && (
            <section className="card mb-4">
              <h2 className="mb-4 text-lg font-bold text-slate-950">Create Campaign</h2>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={createCampaign}>
                <label className="text-sm font-semibold text-slate-700">Campaign Name<input className="mt-1" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
                <label className="text-sm font-semibold text-slate-700">Agent<select className="mt-1" value={form.agentId} onChange={(event) => setForm({ ...form, agentId: event.target.value })}>{agents.map((agent) => <option key={agent._id} value={agent._id}>{agent.agentName}</option>)}</select></label>
                <label className="text-sm font-semibold text-slate-700">Start Date & Time<input className="mt-1" type="datetime-local" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} /></label>
                <label className="text-sm font-semibold text-slate-700">Timezone<input className="mt-1" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></label>
                <NumberField label="Batch Size" value={form.callingSpeed.batchSize} onChange={(value) => setForm({ ...form, callingSpeed: { ...form.callingSpeed, batchSize: value } })} />
                <NumberField label="Delay Seconds" value={form.callingSpeed.delaySeconds} onChange={(value) => setForm({ ...form, callingSpeed: { ...form.callingSpeed, delaySeconds: value } })} />
                <NumberField label="Max Parallel Calls" value={form.callingSpeed.maxParallelCalls} onChange={(value) => setForm({ ...form, callingSpeed: { ...form.callingSpeed, maxParallelCalls: value } })} />
                <NumberField label="Max Attempts" value={form.retryRules.maxAttempts} onChange={(value) => setForm({ ...form, retryRules: { ...form.retryRules, maxAttempts: value } })} />
                <NumberField label="Retry Delay Minutes" value={form.retryRules.retryDelayMinutes} onChange={(value) => setForm({ ...form, retryRules: { ...form.retryRules, retryDelayMinutes: value } })} />
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.retryRules.enabled} onChange={(event) => setForm({ ...form, retryRules: { ...form.retryRules, enabled: event.target.checked } })} />Enable retries</label>
                <div className="md:col-span-2 action-row">
                  <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                  <button className="btn-primary" disabled={loading === "create"}><Plus size={16} />{loading === "create" ? "Creating..." : "Create Campaign"}</button>
                </div>
              </form>
            </section>
          )}

          {!showCreate && !selected && <EmptyState title="Select or create a campaign" description="Campaign details, recipients, and controls will appear here." />}

          {selected && (
            <>
              <section className="card mb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-950">{selected.name}</h2>
                    <p className="text-sm text-slate-500">{selected.agentId?.agentName || "Agent"} · Starts {fmt(selected.startAt)}</p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <Stat label="Total" value={selectedStats.totalRecipients || 0} icon={Users} />
                  <Stat label="Queued" value={selectedStats.queued || 0} icon={CalendarClock} />
                  <Stat label="Calling" value={selectedStats.running || 0} icon={PhoneCall} />
                  <Stat label="Answered" value={selectedStats.answered || 0} icon={PhoneCall} />
                  <Stat label="Failed" value={(selectedStats.failed || 0) + (selectedStats.noAnswer || 0) + (selectedStats.busy || 0) + (selectedStats.declined || 0)} icon={RotateCcw} />
                </div>
                <div className="mt-4 action-row">
                  <button className="btn-primary" disabled={loading === "start" || !["draft", "paused", "scheduled"].includes(selected.status)} onClick={() => campaignAction("start")}><Play size={16} />Start</button>
                  <button className="btn-secondary" disabled={loading === "pause" || !["scheduled", "running"].includes(selected.status)} onClick={() => campaignAction("pause")}><Pause size={16} />Pause</button>
                  <button className="btn-secondary" disabled={loading === "resume" || selected.status !== "paused"} onClick={() => campaignAction("resume")}><Play size={16} />Resume</button>
                  <button className="btn-secondary" disabled={loading === "retry-failed"} onClick={() => campaignAction("retry-failed")}><RotateCcw size={16} />Retry Failed</button>
                  <button className="btn-danger" disabled={loading === "cancel" || ["completed", "cancelled"].includes(selected.status)} onClick={() => campaignAction("cancel")}><Square size={16} />Cancel</button>
                </div>
              </section>

              {selected.status === "draft" && (
                <section className="card mb-4">
                  <h2 className="font-bold text-slate-950">Recipients</h2>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <div>
                      <p className="mb-2 text-sm font-semibold text-slate-700">Select leads</p>
                      <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 p-3">
                        {filteredLeads.map((lead) => (
                          <label key={lead._id} className="flex items-center gap-3 rounded-xl p-2 text-sm hover:bg-slate-50">
                            <input type="checkbox" checked={selectedLeadIds.includes(lead._id)} onChange={(event) => setSelectedLeadIds((current) => event.target.checked ? [...current, lead._id] : current.filter((id) => id !== lead._id))} />
                            <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-slate-950">{leadName(lead)}</span><span className="block truncate text-xs text-slate-500">{lead.phone || lead.email || "-"}</span></span>
                          </label>
                        ))}
                        {!filteredLeads.length && <p className="p-3 text-sm text-slate-500">No leads found for this agent.</p>}
                      </div>
                      <button className="btn-secondary mt-3" disabled={!selectedLeadIds.length || loading === "add-leads"} onClick={addSelectedLeads}><Users size={16} />Add Selected Leads</button>
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-semibold text-slate-700">Import CSV/XLSX recipients</p>
                      <div className="rounded-2xl border border-dashed border-slate-300 p-4">
                        <input type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                        <p className="mt-2 text-xs text-slate-500">Columns: name, phone, email, city, scheduledAt, notes</p>
                        <button className="btn-secondary mt-3" disabled={!file || loading === "import"} onClick={importRecipients}><Upload size={16} />Import Recipients</button>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              <section className="card overflow-hidden p-0">
                <div className="border-b border-slate-200 p-4"><h2 className="font-bold text-slate-950">Campaign Recipients</h2></div>
                <div className="table-wrap">
                  <table className="table w-full min-w-[1100px]">
                    <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Scheduled At</th><th>Attempts</th><th>Last Outcome</th><th>Last Error</th><th>Dograh Run ID</th></tr></thead>
                    <tbody>
                      {recipients.map((recipient) => (
                        <tr key={recipient._id}>
                          <td className="break-anywhere">{recipient.name || leadName(recipient.leadId)}</td>
                          <td>{recipient.phone}</td>
                          <td><StatusBadge status={recipient.status} /></td>
                          <td>{fmt(recipient.scheduledAt)}</td>
                          <td>{recipient.attemptCount || 0}/{recipient.maxAttempts || 0}</td>
                          <td>{recipient.lastOutcome || "-"}</td>
                          <td className="text-rose-700">{recipient.lastError || "-"}</td>
                          <td className="break-anywhere">{recipient.dograhRunId || "-"}</td>
                        </tr>
                      ))}
                      {!recipients.length && <tr><td colSpan="8" className="text-center text-slate-500">No recipients yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </>
  );
}

function Mini({ label, value }) {
  return <div className="rounded-xl bg-white/70 p-2"><p className="text-slate-500">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}

function Stat({ label, value, icon: Icon }) {
  return <article className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><Icon className="mb-2 text-brand-700" size={18} /><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-950">{value}</p></article>;
}

function NumberField({ label, value, onChange }) {
  return <label className="text-sm font-semibold text-slate-700">{label}<input className="mt-1" type="number" min="1" value={value} onChange={(event) => onChange(Number(event.target.value) || 1)} /></label>;
}
