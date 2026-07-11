import { ChevronLeft, ChevronRight, Mail, RefreshCw, Save, Send, Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PageLoader from "../components/PageLoader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const tones = ["Professional", "Friendly", "Concise", "Persuasive", "Warm"];

const initialForm = {
  name: "",
  agentId: "",
  goal: "Book a discovery call",
  offer: "",
  tone: "Professional",
  subject: "",
  body: "",
  testEmail: ""
};

function errorText(err) {
  return err.response ? `${err.message}: ${JSON.stringify(err.response)}` : err.message;
}

function validEmail(value) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(String(value || "").trim().toLowerCase());
}

function isUnsubscribed(lead) {
  return Boolean(lead.emailUnsubscribed || lead.unsubscribed || lead.customFields?.emailUnsubscribed);
}

export default function EmailOutreach() {
  const queryClient = useQueryClient();
  const { data: agents = [], error: agentsError } = useQuery({ queryKey: ["agents"], queryFn: () => api("/agents") });
  const { data: leads = [], error: leadsError, isPending: leadsPending } = useQuery({ queryKey: ["leads"], queryFn: () => api("/leads") });
  const { data: campaigns = [], error: campaignsError } = useQuery({ queryKey: ["email-campaigns"], queryFn: () => api("/email/campaigns") });
  const { data: logs = [], error: logsError } = useQuery({ queryKey: ["email-logs"], queryFn: () => api("/email/logs") });
  const { data: providers = [], error: providersError } = useQuery({ queryKey: ["email-providers"], queryFn: () => api("/email/providers") });
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [form, setForm] = useState(initialForm);
  const loading = leadsPending;
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [campaignResult, setCampaignResult] = useState(null);
  const [showHistory, setShowHistory] = useState(true);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const loadError = agentsError || leadsError || campaignsError || logsError || providersError;
  const error = actionError || (loadError ? errorText(loadError) : "");

  const emailLeads = useMemo(() => {
    const seenEmails = new Set();
    return leads.filter((lead) => {
      const email = String(lead.email || "").trim().toLowerCase();
      const sameAgent = !form.agentId || lead.agentId?._id === form.agentId || lead.agentId === form.agentId;
      if (!sameAgent || !validEmail(email) || isUnsubscribed(lead) || seenEmails.has(email)) return false;
      seenEmails.add(email);
      return true;
    });
  }, [leads, form.agentId]);

  const selectedCount = selectedLeadIds.length;
  const providerSummary = providers.map((provider) => `${provider.label}${provider.configured ? "" : " not configured"}`).join(", ");

  // Default the campaign agent once the agents list has loaded.
  useEffect(() => {
    setForm((current) => ({ ...current, agentId: current.agentId || agents[0]?._id || "" }));
  }, [agents]);

  function reloadAll() {
    queryClient.invalidateQueries({ queryKey: ["agents"] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["email-logs"] });
    queryClient.invalidateQueries({ queryKey: ["email-providers"] });
  }

  function setField(field, value) {
    if (field === "agentId") setSelectedLeadIds([]);
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleLead(id) {
    setSelectedLeadIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAll() {
    setSelectedLeadIds((current) => current.length === emailLeads.length ? [] : emailLeads.map((lead) => lead._id));
  }

  async function generateEmail() {
    setGenerating(true);
    setNotice("");
    setActionError("");
    try {
      const result = await api("/email/generate", {
        method: "POST",
        body: {
          agentId: form.agentId,
          goal: form.goal,
          offer: form.offer,
          tone: form.tone,
          selectedLeadIds
        }
      });
      setForm((current) => ({ ...current, subject: result.subject || "", body: result.body || "" }));
      setNotice(result.warning || "Email subject and body generated.");
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setGenerating(false);
    }
  }

  async function saveDraft() {
    if (!selectedLeadIds.length) {
      setActionError("Select at least one lead with an email address.");
      return null;
    }

    setSaving(true);
    setNotice("");
    setActionError("");
    try {
      const campaign = await api("/email/campaigns", {
        method: "POST",
        body: {
          agentId: form.agentId,
          name: form.name || `Campaign ${new Date().toLocaleDateString()}`,
          subject: form.subject,
          body: form.body,
          selectedLeadIds
        }
      });
      setNotice("Campaign draft saved.");
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      return campaign;
    } catch (err) {
      setActionError(errorText(err));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail() {
    setTesting(true);
    setNotice("");
    setActionError("");
    try {
      const result = await api("/email/test", {
        method: "POST",
        body: {
          agentId: form.agentId,
          testEmail: form.testEmail,
          subject: form.subject,
          body: form.body
        }
      });
      setNotice(result.simulated
        ? `Mock test email simulated for ${result.toEmail}. Set EMAIL_PROVIDER=brevo to deliver real email.`
        : `Test email sent to ${result.toEmail} through ${result.provider}.`
      );
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setTesting(false);
    }
  }

  async function sendCampaign(campaignId) {
    setSending(true);
    setNotice("");
    setActionError("");
    setCampaignResult(null);
    try {
      const campaign = campaignId ? { _id: campaignId } : await saveDraft();
      if (!campaign?._id) return;

      const result = await api(`/email/campaigns/${campaign._id}/send`, { method: "POST" });
      setCampaignResult(result);
      setNotice(`${result.sentCount} sent, ${result.failedCount} failed, ${result.skippedCount} skipped.`);
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["email-logs"] });
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Email Outreach"
        description="Create personalized campaigns for saved leads, send tests, and track email logs."
        action={<button className="btn-secondary" onClick={reloadAll}><RefreshCw size={16} />Refresh</button>}
      />

      {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className={`grid gap-6 ${showHistory ? "xl:grid-cols-[minmax(0,1fr)_24rem]" : "grid-cols-1"}`}>
        <section className="card p-6 sm:p-8">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-y-5 md:grid-cols-2 md:gap-x-12">
              <Field label="Campaign Name">
                <input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Kota coaching outreach" />
              </Field>
              <Field label="Select Agent">
                <select value={form.agentId} onChange={(event) => setField("agentId", event.target.value)} required>
                  <option value="">Select agent</option>
                  {agents.map((agent) => (
                    <option key={agent._id} value={agent._id}>{agent.agentName} - {agent.businessName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Goal">
                <input value={form.goal} onChange={(event) => setField("goal", event.target.value)} placeholder="Book a discovery call" />
              </Field>
              <Field label="Offer">
                <input value={form.offer} onChange={(event) => setField("offer", event.target.value)} placeholder="Free AI call demo this week" />
              </Field>
              <Field label="Tone">
                <select value={form.tone} onChange={(event) => setField("tone", event.target.value)}>
                  {tones.map((tone) => <option key={tone}>{tone}</option>)}
                </select>
              </Field>
              <Field label="Test Email">
                <input value={form.testEmail} onChange={(event) => setField("testEmail", event.target.value)} placeholder="Defaults to your account email" />
              </Field>
            </div>

            <div className="space-y-4">
              <Field label="Subject">
                <input value={form.subject} onChange={(event) => setField("subject", event.target.value)} placeholder="Quick idea for {{businessName}}" />
              </Field>
              <Field label="Body">
                <textarea rows={10} className="min-h-[12rem] leading-6" value={form.body} onChange={(event) => setField("body", event.target.value)} placeholder="Hi {{contactName}}, ..." />
              </Field>
              <p className="text-xs leading-5 text-neutral-500">Placeholders: {"{{businessName}}, {{contactName}}, {{city}}, {{phone}}, {{website}}, {{agentName}}"}</p>
            </div>

            <div className="flex flex-col gap-3 border-t border-hairline pt-6 sm:flex-row sm:flex-wrap sm:items-center">
              <button className="btn-primary" disabled={!form.agentId || generating} onClick={generateEmail}>
                <Sparkles size={16} />{generating ? "Generating..." : "Generate Email"}
              </button>
              <button className="btn-secondary" disabled={!form.agentId || !form.subject || !form.body || testing} onClick={sendTestEmail}>
                <Mail size={16} />{testing ? "Sending test..." : "Send Test Email"}
              </button>
              <button className="btn-secondary" disabled={!form.agentId || !selectedCount || saving} onClick={saveDraft}>
                <Save size={16} />{saving ? "Saving draft..." : "Save Draft"}
              </button>
              <button className="btn-primary sm:ml-auto" disabled={!form.agentId || !selectedCount || !form.subject || !form.body || sending} onClick={() => sendCampaign()}>
                <Send size={16} />{sending ? "Sending campaign..." : "Send Campaign"}
              </button>
            </div>
          </div>
        </section>

        {showHistory && (
        <aside className="card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-ink">Campaign History</h2>
              <p className="mt-1 text-sm text-neutral-500">{providerSummary || "Email provider loading"}</p>
            </div>
            <button className="btn-secondary h-9 min-h-9 px-3 py-1.5" onClick={() => setShowHistory(false)} aria-label="Hide campaign history">
              <ChevronRight size={16} />Hide
            </button>
          </div>
          <div className="mt-4 max-h-[34rem] space-y-2 overflow-auto">
            {!campaigns.length ? (
              <EmptyState title="No campaigns yet" description="Saved drafts and sent campaigns will appear here." />
            ) : campaigns.map((campaign) => (
              <article key={campaign._id} className="rounded-2xl border border-hairline p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="break-anywhere text-sm font-semibold text-ink">{campaign.name}</p>
                  <StatusBadge status={campaign.status} />
                </div>
                <p className="mt-1 break-anywhere text-xs text-neutral-500">{campaign.subject || "No subject"}</p>
                <p className="mt-2 text-xs text-neutral-500">{campaign.sentCount || 0} sent - {campaign.failedCount || 0} failed - {campaign.totalRecipients || 0} recipients</p>
                {campaign.status === "draft" && (
                  <button className="btn-secondary mt-3 w-full" disabled={sending} onClick={() => sendCampaign(campaign._id)}>
                    <Send size={16} />Send Draft
                  </button>
                )}
              </article>
            ))}
          </div>
        </aside>
        )}
      </div>

      {!showHistory && (
        <div>
          <button className="btn-secondary" onClick={() => setShowHistory(true)}>
            <ChevronLeft size={16} />Show Campaign History
          </button>
        </div>
      )}

      {campaignResult && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ResultCard label="Total" value={campaignResult.totalRecipients || 0} />
          <ResultCard label="Sent" value={campaignResult.sentCount || 0} />
          <ResultCard label="Failed" value={campaignResult.failedCount || 0} />
          <ResultCard label="Skipped" value={campaignResult.skippedCount || 0} />
        </section>
      )}

      <section className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-4">
          <div>
            <h2 className="font-semibold text-ink">Saved Leads With Email</h2>
            <p className="text-sm text-neutral-500">{selectedCount} selected from {emailLeads.length} valid email leads</p>
          </div>
          <button className="btn-secondary" disabled={!emailLeads.length} onClick={toggleAll}>
            {selectedCount === emailLeads.length ? "Clear Selection" : "Select All"}
          </button>
        </div>
        {loading ? (
          <PageLoader label="Loading leads" />
        ) : !emailLeads.length ? (
          <div className="p-6"><EmptyState title="No leads with email" description="Save leads with email addresses before creating a campaign." /></div>
        ) : (
          <div className="table-wrap">
            <table className="table w-full min-w-[28rem]">
              <thead>
                <tr>
                  <th><input className="h-3.5 w-3.5 accent-ink" type="checkbox" checked={selectedCount === emailLeads.length} onChange={toggleAll} /></th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {emailLeads.map((lead) => (
                  <tr key={lead._id}>
                    <td><input className="h-3.5 w-3.5 accent-ink" type="checkbox" checked={selectedLeadIds.includes(lead._id)} onChange={() => toggleLead(lead._id)} /></td>
                    <td className="break-anywhere">{lead.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden p-0">
        <div className="border-b border-hairline p-4">
          <h2 className="font-semibold text-ink">Email Logs</h2>
          <p className="text-sm text-neutral-500">Recent sent and failed attempts</p>
        </div>
        {!logs.length ? (
          <div className="p-6"><EmptyState title="No email logs yet" /></div>
        ) : (
          <div className="table-wrap">
            <table className="table w-full min-w-[900px]">
              <thead>
                <tr><th>Lead</th><th>Email</th><th>Status</th><th>Error</th><th>Sent Time</th></tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id}>
                    <td className="break-anywhere">{log.leadId?.businessName || log.leadId?.name || "-"}</td>
                    <td className="break-anywhere">{log.toEmail}</td>
                    <td><StatusBadge status={log.status} /></td>
                    <td className="break-anywhere">{log.error || "-"}</td>
                    <td>{log.sentAt ? new Date(log.sentAt).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[13px] font-medium text-neutral-700">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function ResultCard({ label, value }) {
  return (
    <article className="card">
      <p className="text-sm font-semibold text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
    </article>
  );
}
