import { ExternalLink, History, MailSearch, MapPin, MoreVertical, RefreshCw, Save, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openActionsId, setOpenActionsId] = useState("");
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
    setHistoryOpen(false);
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
    <div className="page-stack">
      <PageHeader
        title="Lead Finder"
        description="Search business leads with provider-based integrations and save them into your Leads CRM."
        action={(
          <button className="btn-secondary" onClick={() => setHistoryOpen(true)}>
            <History size={16} />History
          </button>
        )}
      />

      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <section className="card p-6 sm:p-8">
        <form onSubmit={searchLeads} className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
          </div>

          <div className="grid items-end gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Provider" helper={selectedProvider?.configured === false ? "Provider not configured" : undefined}>
              <select value={form.provider} onChange={(event) => setField("provider", event.target.value)}>
                {providers.map((provider) => (
                  <option key={provider.key} value={provider.key}>
                    {provider.label}{provider.configured ? "" : " (not configured)"}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex min-h-[40px] items-center gap-2">
              <Toggle
                checked={form.enrichEmails}
                onChange={(value) => setField("enrichEmails", value)}
                label="Find emails from websites"
              />
              <span className="text-sm font-medium text-neutral-700">Find emails from websites</span>
            </div>
            <button className="btn-primary w-full" disabled={searching || !form.agentId || selectedProvider?.configured === false}>
              <Search size={16} />
              {searching ? "Searching leads..." : "Search Leads"}
            </button>
          </div>
        </form>
      </section>

      <section className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-4">
          <div>
            <h2 className="font-semibold text-ink">Results</h2>
            <p className="text-sm text-neutral-500">{leadsPreview.length ? `${leadsPreview.length} leads ready to review` : "No leads found"}</p>
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
            <table className="table w-full min-w-[1180px]">
              <thead>
                <tr>
                  <th><input className="accent-ink" type="checkbox" checked={selectedIds.length === leadsPreview.length} onChange={toggleAll} /></th>
                  <th className="min-w-[14rem]">Business Name</th>
                  <th className="min-w-[9rem]">Phone</th>
                  <th className="min-w-[14rem]">Email</th>
                  <th className="min-w-[18rem]">Website</th>
                  <th className="min-w-[9rem]">City</th>
                  <th className="min-w-[11rem]">Category</th>
                  <th className="w-16 text-right">Options</th>
                </tr>
              </thead>
              <tbody>
                {leadsPreview.map((lead) => (
                  <tr key={lead._id}>
                    <td><input className="accent-ink" type="checkbox" checked={selectedIds.includes(lead._id)} onChange={() => toggleLead(lead._id)} /></td>
                    <td className="break-anywhere">
                      <div className="font-semibold text-ink">{lead.businessName || "Unknown business"}</div>
                      {lead.savedLeadId && <span className="text-xs font-semibold text-emerald-600">Saved</span>}
                    </td>
                    <td className="break-anywhere">{lead.phone || "-"}</td>
                    <td className="break-anywhere" title={(lead.emails || []).join(", ")}>{lead.email || "-"}</td>
                    <td>
                      <div className="max-w-[22rem] truncate" title={lead.website || "-"}>
                        {lead.website || "-"}
                      </div>
                    </td>
                    <td>{lead.city || "-"}</td>
                    <td>{lead.category || "-"}</td>
                    <td className="text-right">
                      <LeadFinderActionsMenu
                        lead={lead}
                        isOpen={openActionsId === lead._id}
                        setOpen={(open) => setOpenActionsId(open ? lead._id : "")}
                        saving={saving}
                        enriching={enrichingIds.includes(lead._id)}
                        enrichEmails={enrichEmails}
                        saveLeads={saveLeads}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {historyOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-[1px]" onClick={() => setHistoryOpen(false)}>
          <div
            className="flex h-full w-full max-w-md min-w-0 flex-col bg-white shadow-pop"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline p-5">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink">Search History</h2>
                <p className="text-[13px] text-neutral-500">Recent provider runs</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button className="btn-secondary" onClick={() => load().catch((err) => setError(errorText(err)))}>
                  <RefreshCw size={16} />Refresh
                </button>
                <button
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Close history"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
              {!runs.length ? (
                <EmptyState title="No searches yet" description="Your provider searches will appear here." />
              ) : runs.map((run) => (
                <button
                  key={run._id}
                  className="w-full rounded-xl border border-hairline p-3 text-left transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1"
                  onClick={() => loadRun(run._id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="break-anywhere text-sm font-semibold text-ink">{run.query || "Lead search"}</p>
                    <StatusBadge status={run.status} />
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-neutral-500">{run.provider} · {run.totalFound || 0} found</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, helper, children }) {
  return (
    <label className="min-w-0">
      <span className="block text-[13px] font-medium text-neutral-700">{label}</span>
      <div className="mt-1.5">{children}</div>
      {helper && <span className="mt-1 block text-xs font-medium text-amber-600">{helper}</span>}
    </label>
  );
}

function LeadFinderActionsMenu({ lead, isOpen, setOpen, saving, enriching, enrichEmails, saveLeads }) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 320 });

  function updatePosition() {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const width = Math.min(270, window.innerWidth - 24);
    const menuHeight = menuRef.current?.offsetHeight || 280;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const opensUp = spaceBelow < menuHeight && rect.top > spaceBelow;
    const maxHeight = Math.max(220, opensUp ? rect.top - 16 : spaceBelow);
    const top = opensUp ? Math.max(12, rect.top - Math.min(menuHeight, maxHeight) - 8) : rect.bottom + 8;
    const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);

    setPosition({ top, left, maxHeight });
  }

  useEffect(() => {
    if (!isOpen) return undefined;

    updatePosition();

    function onPointerDown(event) {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, lead._id]);

  function run(action) {
    setOpen(false);
    action();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="inline-grid h-9 w-9 place-items-center rounded-xl border border-hairline bg-white text-neutral-600 transition hover:bg-neutral-50 hover:text-ink"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open lead finder options"
        title="Open lead finder options"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isOpen) updatePosition();
          setOpen(!isOpen);
        }}
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="fixed z-[9999] w-[min(16.875rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-hairline bg-white p-2 text-left shadow-pop"
          style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
          role="menu"
        >
          <div className="px-2 pb-2 pt-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Actions</p>
            {lead.website && (
              <MenuLink href={lead.website} icon={ExternalLink} target="_blank" onClick={() => setOpen(false)}>
                View Website
              </MenuLink>
            )}
            {lead.googleMapsUrl && (
              <MenuLink href={lead.googleMapsUrl} icon={MapPin} target="_blank" onClick={() => setOpen(false)}>
                Open Google Map
              </MenuLink>
            )}
            <MenuButton icon={MailSearch} disabled={!lead.website || enriching} onClick={() => run(() => enrichEmails([lead._id]))}>
              {enriching ? "Finding Email..." : "Find Email"}
            </MenuButton>
            <MenuButton icon={Save} disabled={saving} onClick={() => run(() => saveLeads([lead._id]))}>
              {saving ? "Saving Lead..." : "Save Lead"}
            </MenuButton>
          </div>
        </div>
      )}
    </>
  );
}

function MenuButton({ children, icon: Icon, disabled = false, onClick }) {
  return (
    <button
      type="button"
      className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-neutral-700 hover:bg-neutral-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
    >
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

function MenuLink({ children, icon: Icon, href, target, onClick }) {
  return (
    <a
      className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-semibold text-neutral-700 hover:bg-neutral-50 hover:text-ink"
      href={href}
      target={target}
      rel={target === "_blank" ? "noreferrer" : undefined}
      onClick={onClick}
      role="menuitem"
    >
      <Icon size={16} className="shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </a>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 ${checked ? "bg-ink" : "bg-neutral-200"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition motion-reduce:transition-none ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}
