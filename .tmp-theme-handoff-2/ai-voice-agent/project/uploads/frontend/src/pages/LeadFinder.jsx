import { ExternalLink, MailSearch, MapPin, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const initialForm = {
  agentId: "",
  category: "",
  keyword: "",
  city: "",
  country: "India",
  totalRequested: 25,
  provider: "mock",
  enrichEmails: false
};

function errorText(err) {
  return err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message;
}

export default function LeadFinder() {
  const [agents, setAgents] = useState([]);
  const [providers, setProviders] = useState([]);
  const [runs, setRuns] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [currentRunId, setCurrentRunId] = useState("");
  const [leadsPreview, setLeadsPreview] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enrichingIds, setEnrichingIds] = useState([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.key === form.provider),
    [providers, form.provider]
  );

  async function load() {
    const [agentList, providerList, runList] = await Promise.all([
      api("/agents"),
      api("/lead-finder/providers"),
      api("/lead-finder/runs")
    ]);
    setAgents(agentList);
    setProviders(providerList);
    setRuns(runList);
    setForm((current) => ({
      ...current,
      agentId: current.agentId || agentList[0]?._id || "",
      provider: current.provider || providerList[0]?.key || "mock"
    }));
  }

  useEffect(() => {
    load().catch((err) => setError(errorText(err)));
  }, []);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleLead(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAll() {
    setSelectedIds((current) => current.length === leadsPreview.length ? [] : leadsPreview.map((lead) => lead._id));
  }

  function enrichmentLabel(status) {
    if (enrichingIds.length && status === "loading") return "Finding...";
    const labels = { found: "Found", not_found: "Not Found", failed: "Failed", not_started: "Pending" };
    return labels[status] || "Pending";
  }

  async function searchLeads(event) {
    event.preventDefault();
    setSearching(true);
    setNotice("");
    setError("");
    setSelectedIds([]);

    try {
      const result = await api("/lead-finder/search", { method: "POST", body: form });
      setCurrentRunId(result.runId);
      setLeadsPreview(result.leadsPreview || []);
      setSelectedIds((result.leadsPreview || []).map((lead) => lead._id));
      setNotice(result.totalFound ? `${result.totalFound} leads found.` : "No leads found.");
      const runList = await api("/lead-finder/runs");
      setRuns(runList);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSearching(false);
    }
  }

  async function loadRun(runId) {
    setNotice("");
    setError("");
    try {
      const run = await api(`/lead-finder/runs/${runId}`);
      setCurrentRunId(run._id);
      setLeadsPreview(run.leadsPreview || []);
      setSelectedIds((run.leadsPreview || []).filter((lead) => !lead.savedLeadId).map((lead) => lead._id));
      setForm((current) => ({
        ...current,
        agentId: run.agentId?._id || run.agentId || current.agentId,
        category: run.category || "",
        keyword: run.keyword || "",
        city: run.city || "",
        country: run.country || "",
        totalRequested: run.totalRequested || 25,
        provider: run.provider || "mock",
        enrichEmails: false
      }));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function saveLeads(leadIds) {
    if (!currentRunId) return;
    const ids = leadIds || selectedIds;
    if (!ids.length) {
      setError("Select at least one lead to save.");
      return;
    }

    setSaving(true);
    setNotice("");
    setError("");

    try {
      const result = await api(`/lead-finder/runs/${currentRunId}/save`, { method: "POST", body: { leadIds: ids } });
      setNotice(`${result.created} new leads saved, ${result.updated} existing leads updated.`);
      const run = await api(`/lead-finder/runs/${currentRunId}`);
      setLeadsPreview(run.leadsPreview || []);
      setSelectedIds([]);
      setRuns(await api("/lead-finder/runs"));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function enrichEmails(leadIds) {
    if (!currentRunId) {
      setError("Run a lead search before finding emails.");
      return;
    }

    const ids = leadIds?.length ? leadIds : selectedIds.length ? selectedIds : leadsPreview.map((lead) => lead._id);
    if (!ids.length) return;

    setEnrichingIds(ids);
    setNotice("");
    setError("");

    try {
      const result = await api("/lead-finder/enrich-emails", {
        method: "POST",
        body: { runId: currentRunId, leadIds: ids }
      });
      setLeadsPreview(result.leadsPreview || []);
      const found = (result.leadsPreview || []).filter((lead) => ids.includes(lead._id) && lead.emailEnrichmentStatus === "found").length;
      setNotice(`${found} leads enriched with email addresses.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setEnrichingIds([]);
    }
  }

  return (
    <>
      <PageHeader
        title="Lead Finder"
        description="Search business leads with provider-based integrations and save them into your Leads CRM."
      />

      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card">
          <form onSubmit={searchLeads} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Select Agent">
              <select value={form.agentId} onChange={(event) => setField("agentId", event.target.value)} required>
                <option value="">Select agent</option>
                {agents.map((agent) => (
                  <option key={agent._id} value={agent._id}>{agent.agentName} - {agent.businessName}</option>
                ))}
              </select>
            </Field>
            <Field label="Business Category">
              <input value={form.category} onChange={(event) => setField("category", event.target.value)} placeholder="Coaching Center" required />
            </Field>
            <Field label="Keyword">
              <input value={form.keyword} onChange={(event) => setField("keyword", event.target.value)} placeholder="NEET coaching" />
            </Field>
            <Field label="City">
              <input value={form.city} onChange={(event) => setField("city", event.target.value)} placeholder="Kota" required />
            </Field>
            <Field label="Country">
              <input value={form.country} onChange={(event) => setField("country", event.target.value)} placeholder="India" />
            </Field>
            <Field label="Number of Leads">
              <input type="number" min="1" max="100" value={form.totalRequested} onChange={(event) => setField("totalRequested", Number(event.target.value))} />
            </Field>
            <Field label="Provider">
              <select value={form.provider} onChange={(event) => setField("provider", event.target.value)}>
                {providers.map((provider) => (
                  <option key={provider.key} value={provider.key}>
                    {provider.label}{provider.configured ? "" : " (not configured)"}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-end gap-2 pb-3 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={form.enrichEmails} onChange={(event) => setField("enrichEmails", event.target.checked)} />
              Find emails from websites
            </label>
            <div className="flex items-end">
              <button className="btn-primary w-full" disabled={searching || !form.agentId || selectedProvider?.configured === false}>
                <Search size={16} />
                {searching ? "Searching leads..." : "Search Leads"}
              </button>
            </div>
            {selectedProvider?.configured === false && (
              <div className="flex items-end text-sm font-semibold text-amber-600">Provider not configured</div>
            )}
          </form>
        </section>

        <aside className="card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-950">Search History</h2>
              <p className="text-sm text-slate-500">Recent provider runs</p>
            </div>
            <button className="btn-secondary" onClick={() => load().catch((err) => setError(errorText(err)))}>Refresh</button>
          </div>
          <div className="mt-4 max-h-80 space-y-2 overflow-auto">
            {!runs.length ? (
              <EmptyState title="No searches yet" description="Searches will appear here." />
            ) : runs.map((run) => (
              <button key={run._id} className="w-full rounded-2xl border border-slate-200 p-3 text-left transition hover:bg-slate-50" onClick={() => loadRun(run._id)}>
                <div className="flex items-start justify-between gap-2">
                  <p className="break-anywhere text-sm font-bold text-slate-950">{run.query || "Lead search"}</p>
                  <StatusBadge status={run.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{run.provider} - {run.totalFound || 0} found</p>
              </button>
            ))}
          </div>
        </aside>
      </div>

      <section className="card mt-4 overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="font-bold text-slate-950">Results</h2>
            <p className="text-sm text-slate-500">{leadsPreview.length ? `${leadsPreview.length} leads ready to review` : "No leads found"}</p>
          </div>
          <div className="action-row">
            <button className="btn-secondary" disabled={!leadsPreview.length || saving} onClick={toggleAll}>
              {selectedIds.length === leadsPreview.length ? "Clear Selection" : "Select All"}
            </button>
            <button className="btn-secondary" disabled={!currentRunId || !leadsPreview.length || enrichingIds.length} onClick={() => enrichEmails()}>
              <MailSearch size={16} />{enrichingIds.length ? "Finding Emails..." : "Find Emails"}
            </button>
            <button className="btn-secondary" disabled={!currentRunId || !selectedIds.length || saving} onClick={() => saveLeads(selectedIds)}>
              <Save size={16} />{saving ? "Saving leads..." : "Save Selected"}
            </button>
            <button className="btn-primary" disabled={!currentRunId || !leadsPreview.length || saving} onClick={() => saveLeads(leadsPreview.map((lead) => lead._id))}>
              <Save size={16} />Save All Leads
            </button>
          </div>
        </div>

        {searching ? (
          <div className="p-6"><EmptyState title="Searching leads..." /></div>
        ) : !leadsPreview.length ? (
          <div className="p-6"><EmptyState title="No leads found" description="Try a different city, keyword, category, or provider." /></div>
        ) : (
          <div className="table-wrap">
            <table className="table w-full min-w-[1100px]">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={selectedIds.length === leadsPreview.length} onChange={toggleAll} /></th>
                  <th>Business Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Email Status</th>
                  <th>Website</th>
                  <th>City</th>
                  <th>Category</th>
                  <th>Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leadsPreview.map((lead) => (
                  <tr key={lead._id}>
                    <td><input type="checkbox" checked={selectedIds.includes(lead._id)} onChange={() => toggleLead(lead._id)} /></td>
                    <td className="break-anywhere">
                      <div className="font-semibold text-slate-950">{lead.businessName || "Unknown business"}</div>
                      {lead.savedLeadId && <span className="text-xs font-semibold text-emerald-600">Saved</span>}
                    </td>
                    <td className="break-anywhere">{lead.phone || "-"}</td>
                    <td className="break-anywhere" title={(lead.emails || []).join(", ")}>{lead.email || "-"}</td>
                    <td>
                      {enrichingIds.includes(lead._id)
                        ? <span className="badge bg-amber-50 text-amber-700">Finding...</span>
                        : <StatusBadge status={enrichmentLabel(lead.emailEnrichmentStatus)} />}
                    </td>
                    <td className="break-anywhere">{lead.website || "-"}</td>
                    <td>{lead.city || "-"}</td>
                    <td>{lead.category || "-"}</td>
                    <td>{lead.source || "-"}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {lead.website && <a className="rounded-xl border border-slate-200 p-2" href={lead.website} target="_blank" title="View Website"><ExternalLink size={16} /></a>}
                        {lead.googleMapsUrl && <a className="rounded-xl border border-slate-200 p-2" href={lead.googleMapsUrl} target="_blank" title="Open Google Map"><MapPin size={16} /></a>}
                        <button className="rounded-xl border border-slate-200 p-2" disabled={!lead.website || enrichingIds.includes(lead._id)} onClick={() => enrichEmails([lead._id])} title="Find Email"><MailSearch size={16} /></button>
                        <button className="rounded-xl border border-slate-200 p-2" disabled={saving} onClick={() => saveLeads([lead._id])} title="Save Lead"><Save size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Field({ label, children }) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}
