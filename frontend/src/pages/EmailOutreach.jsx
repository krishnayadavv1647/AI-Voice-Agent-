import { Mail, RefreshCw, Save, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "../components/EmptyState.jsx";
import PageHeader from "../components/PageHeader.jsx";
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
  const [agents, setAgents] = useState([]);
  const [leads, setLeads] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [logs, setLogs] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [campaignResult, setCampaignResult] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

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

  async function load() {
    setLoading(true);
    const [agentList, leadList, campaignList, logList, providerList] = await Promise.all([
      api("/agents"),
      api("/leads"),
      api("/email/campaigns"),
      api("/email/logs"),
      api("/email/providers")
    ]);
    setAgents(agentList);
    setLeads(leadList);
    setCampaigns(campaignList);
    setLogs(logList);
    setProviders(providerList);
    setForm((current) => ({ ...current, agentId: current.agentId || agentList[0]?._id || "" }));
    setLoading(false);
  }

  useEffect(() => {
    load().catch((err) => {
      setLoading(false);
      setError(errorText(err));
    });
  }, []);

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
    setError("");
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
      setError(errorText(err));
    } finally {
      setGenerating(false);
    }
  }

  async function saveDraft() {
    if (!selectedLeadIds.length) {
      setError("Select at least one lead with an email address.");
      return null;
    }

    setSaving(true);
    setNotice("");
    setError("");
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
      setCampaigns(await api("/email/campaigns"));
      return campaign;
    } catch (err) {
      setError(errorText(err));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail() {
    setTesting(true);
    setNotice("");
    setError("");
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
      setError(errorText(err));
    } finally {
      setTesting(false);
    }
  }

  async function sendCampaign(campaignId) {
    setSending(true);
    setNotice("");
    setError("");
    setCampaignResult(null);
    try {
      const campaign = campaignId ? { _id: campaignId } : await saveDraft();
      if (!campaign?._id) return;

      const result = await api(`/email/campaigns/${campaign._id}/send`, { method: "POST" });
      setCampaignResult(result);
      setNotice(`${result.sentCount} sent, ${result.failedCount} failed, ${result.skippedCount} skipped.`);
      const [campaignList, logList] = await Promise.all([api("/email/campaigns"), api("/email/logs")]);
      setCampaigns(campaignList);
      setLogs(logList);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Email Outreach"
        description="Create personalized campaigns for saved leads, send tests, and track email logs."
        action={<button className="btn-secondary" onClick={() => load().catch((err) => setError(errorText(err)))}><RefreshCw size={16} />Refresh</button>}
      />

      {notice && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="card">
          <div className="grid gap-4 md:grid-cols-2">
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

          <div className="mt-5 action-row">
            <button className="btn-primary" disabled={!form.agentId || generating} onClick={generateEmail}>
              <Sparkles size={16} />{generating ? "Generating..." : "Generate Email"}
            </button>
            <button className="btn-secondary" disabled={!form.agentId || !form.subject || !form.body || testing} onClick={sendTestEmail}>
              <Mail size={16} />{testing ? "Sending test..." : "Send Test Email"}
            </button>
            <button className="btn-secondary" disabled={!form.agentId || !selectedCount || saving} onClick={saveDraft}>
              <Save size={16} />{saving ? "Saving draft..." : "Save Draft"}
            </button>
            <button className="btn-primary" disabled={!form.agentId || !selectedCount || !form.subject || !form.body || sending} onClick={() => sendCampaign()}>
              <Send size={16} />{sending ? "Sending campaign..." : "Send Campaign"}
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            <Field label="Subject">
              <input value={form.subject} onChange={(event) => setField("subject", event.target.value)} placeholder="Quick idea for {{businessName}}" />
            </Field>
            <Field label="Body">
              <textarea rows={10} value={form.body} onChange={(event) => setField("body", event.target.value)} placeholder="Hi {{contactName}}, ..." />
            </Field>
            <p className="text-xs text-slate-500">Placeholders: {"{{businessName}}, {{contactName}}, {{city}}, {{phone}}, {{website}}, {{agentName}}"}</p>
          </div>
        </section>

        <aside className="card">
          <h2 className="font-bold text-slate-950">Campaign History</h2>
          <p className="mt-1 text-sm text-slate-500">{providerSummary || "Email provider loading"}</p>
          <div className="mt-4 max-h-[34rem] space-y-2 overflow-auto">
            {!campaigns.length ? (
              <EmptyState title="No campaigns yet" description="Saved drafts and sent campaigns will appear here." />
            ) : campaigns.map((campaign) => (
              <article key={campaign._id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="break-anywhere text-sm font-bold text-slate-950">{campaign.name}</p>
                  <StatusBadge status={campaign.status} />
                </div>
                <p className="mt-1 break-anywhere text-xs text-slate-500">{campaign.subject || "No subject"}</p>
                <p className="mt-2 text-xs text-slate-500">{campaign.sentCount || 0} sent - {campaign.failedCount || 0} failed - {campaign.totalRecipients || 0} recipients</p>
                {campaign.status === "draft" && (
                  <button className="btn-secondary mt-3 w-full" disabled={sending} onClick={() => sendCampaign(campaign._id)}>
                    <Send size={16} />Send Draft
                  </button>
                )}
              </article>
            ))}
          </div>
        </aside>
      </div>

      {campaignResult && (
        <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ResultCard label="Total" value={campaignResult.totalRecipients || 0} />
          <ResultCard label="Sent" value={campaignResult.sentCount || 0} />
          <ResultCard label="Failed" value={campaignResult.failedCount || 0} />
          <ResultCard label="Skipped" value={campaignResult.skippedCount || 0} />
        </section>
      )}

      <section className="card mt-4 overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h2 className="font-bold text-slate-950">Saved Leads With Email</h2>
            <p className="text-sm text-slate-500">{selectedCount} selected from {emailLeads.length} valid email leads</p>
          </div>
          <button className="btn-secondary" disabled={!emailLeads.length} onClick={toggleAll}>
            {selectedCount === emailLeads.length ? "Clear Selection" : "Select All"}
          </button>
        </div>
        {loading ? (
          <div className="p-6"><EmptyState title="Loading leads..." /></div>
        ) : !emailLeads.length ? (
          <div className="p-6"><EmptyState title="No leads with email" description="Save leads with email addresses before creating a campaign." /></div>
        ) : (
          <div className="table-wrap">
            <table className="table w-full min-w-[950px]">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={selectedCount === emailLeads.length} onChange={toggleAll} /></th>
                  <th>Business Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>City</th>
                  <th>Status</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {emailLeads.map((lead) => (
                  <tr key={lead._id}>
                    <td><input type="checkbox" checked={selectedLeadIds.includes(lead._id)} onChange={() => toggleLead(lead._id)} /></td>
                    <td className="break-anywhere">{lead.businessName || lead.name || "Unknown business"}</td>
                    <td className="break-anywhere">{lead.email}</td>
                    <td className="break-anywhere">{lead.phone || "-"}</td>
                    <td>{lead.city || "-"}</td>
                    <td><StatusBadge status={lead.status} /></td>
                    <td>{lead.source || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-4 overflow-hidden p-0">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-bold text-slate-950">Email Logs</h2>
          <p className="text-sm text-slate-500">Recent sent and failed attempts</p>
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

function ResultCard({ label, value }) {
  return (
    <article className="card">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
    </article>
  );
}
